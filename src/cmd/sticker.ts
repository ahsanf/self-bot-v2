import { WAMessage, WASocket } from '@whiskeysockets/baileys'
import { Sticker, StickerTypes } from 'wa-sticker-formatter'
import { removeBackgroundFromImageBase64 } from 'remove.bg'
import { textToPicture, uploadImage, memegen } from '../lib'
import { MessageData } from '../utils'
import { actions } from '../handler'
import stringId from '../language'
import { menu } from '../menu'
import lodash from 'lodash'
import sharp from 'sharp'

export default function () {
  Object.assign(actions, {
    sticker: stickerHandler,
    ttpc: ttpHandler,
    memefy: memefyHandler,
  })

  stringId.sticker = {
    hint: '🖼️ _Convert media ke sticker_',
    error: {
      videoLimit: (s: number) =>
        `‼️ Video terlalu panjang, maksimal ${s} detik`,
      quality: (q: number) =>
        `⚠️ Result exceeded 1 MB with Q: ${q}%\n⏳ Hold on, decreasing quality...`,
      q: (q: number) => `⏳ Q: ${q}% still not yet...`,
      fail: `‼️ Gagal mengubah video ke sticker, coba kurangi durasi.`,
    },
    usage: (data: MessageData) =>
      `Kirim gambar/video atau balas gambar/video dengan caption ${data.prefix}${data.cmd}
⚙️ Gunakan: '-r' rounded corner, '-c' square cropped, '-nobg' hapus bg,
⚙️ Custom packname/author dengan args 'packname|author',
➡️ Contoh: ${data.prefix}${data.cmd} -r -nobg created with|serobot✨`,
  }

  stringId.ttp = {
    hint: '🖼️ _Convert teks ke sticker_',
    error: {
      textLimit: (s: number) =>
        `‼️ Teks terlalu panjang, maksimal ${s} karakter`,
    },
    usage: (data: MessageData) =>
      `Tambahkan teks atau balas teks dengan ${data.prefix}${data.cmd} <teks>\n` +
      `➡️ Contoh: ${data.prefix}ttp Serobot\n` +
      `Custom color dengan args 'color1|color2|strokecolor'\n` +
      `➡️ Contoh: ${data.prefix}ttpc red|blue|white Serobot`,
  }

  stringId.memefy = {
    hint: '🖼️ _Tambah tulisan di gambar/sticker_',
    error: {
      textLimit: (s: number) =>
        `‼️ Teks terlalu panjang, maksimal ${s} karakter`,
    },
    usage: (data: MessageData) =>
      `Tambahkan teks atau balas gambar/sticker dengan ${data.prefix}${data.cmd} <atas|bawah>\n⚙️ Gunakan: '-c' square cropped`,
  }

  menu.push(
    {
      command: 'sticker',
      hint: stringId.sticker.hint,
      alias: 's, stiker',
      type: 'sticker',
    },
    {
      command: 'ttpc',
      hint: stringId.ttp.hint,
      alias: 'ttp',
      type: 'sticker',
    },
    {
      command: 'memefy',
      hint: stringId.memefy.hint,
      alias: 'sm',
      type: 'sticker',
    }
  )
}

const stickerHandler = async (
  _wa: WASocket,
  msg: WAMessage,
  data: MessageData
) => {
  const {
    arg,
    isMedia,
    isImage,
    isVideo,
    isQuoted,
    isQuotedImage,
    isQuotedVideo,
    replySticker,
  } = data
  if (!isMedia) throw new Error(stringId.sticker.usage(data))
  data.reactWait()
  let mediaData = isQuoted ? await data.downloadQuoted() : await data.download()
  let Stype = arg.includes('-r') ? StickerTypes.ROUNDED : StickerTypes.FULL
  Stype = arg.includes('-c') ? StickerTypes.CROPPED : Stype
  if (arg.includes('-nobg')) {
    const base64 = mediaData.toString('base64')
    const res = await removeBackgroundFromImageBase64({
      base64img: base64,
      apiKey: lodash.sample(process.env.REMOVEBG_APIKEY!.split(', ')) as string,
      size: 'auto',
    })
    mediaData = Buffer.from(res.base64img, 'base64')
  }
  const argMeta = arg.replace(/-r|-c|-nobg/g, '').trim()
  const packname = argMeta.split('|')[0] || process.env.PACKNAME!
  const author = argMeta.split('|')[1] || process.env.AUTHOR!

  if (isImage || isQuotedImage) {
    const sticker = new Sticker(mediaData, {
      pack: packname,
      author: author,
      type: Stype,
      quality: 100,
    })
    data.reactSuccess()
    await replySticker(await sticker.toBuffer())
  }

  if (isVideo || isQuotedVideo) {
    await processVideo(msg, mediaData, data, packname, author, Stype)
  }
}

const processVideo = async (
  msg: WAMessage,
  mediaData: Buffer,
  data: MessageData,
  packname: string,
  author: string,
  Stype: StickerTypes
) => {
  const seconds =
    msg.message?.videoMessage?.seconds! ||
    data.quotedMsg?.videoMessage?.seconds!
  const videoLimit = 10
  if (seconds >= videoLimit)
    throw new Error(stringId.sticker.error.videoLimit(videoLimit))

  let defaultQuality = 80
  const doConvert = (quality: number = defaultQuality) => {
    return new Sticker(mediaData, {
      pack: packname,
      author: author,
      type: Stype,
      quality: quality,
    }).toBuffer()
  }
  let resultBuffer = await doConvert()
  let isSendNotif = false
  while (resultBuffer.length > 1024 * 1024) {
    if (!isSendNotif) {
      data.send(stringId.sticker.error.quality(defaultQuality))
      isSendNotif = true
    } else {
      data.send(stringId.sticker.error.q(defaultQuality))
    }
    if (defaultQuality <= 10) defaultQuality = 1
    else defaultQuality -= 10
    if (defaultQuality <= 0) throw new Error(stringId.sticker.error.fail)
    resultBuffer = await doConvert(defaultQuality)
  }
  data.reactSuccess()
  await data.replySticker(resultBuffer)
}

const ttpHandler = async (
  _wa: WASocket,
  _msg: WAMessage,
  data: MessageData
) => {
  const { arg, args, cmd, isQuoted, isMedia, replySticker } = data
  if ((!arg && !isQuoted) || isMedia) throw new Error(stringId.ttp.usage(data))
  data.reactWait()
  const text =
    arg ||
    data.quotedMsg?.conversation! ||
    data.quotedMsg?.extendedTextMessage?.text!
  const textLimit = 100
  if (text.length > textLimit)
    throw new Error(stringId.ttp.error.textLimit(textLimit))

  let image: Buffer
  if (cmd === 'ttpc') {
    const col = args[0].split('|')[0]
    const col2 = args[0].split('|')[1] || col
    const col3 = args[0].split('|')[2] || 'black'
    image = await textToPicture(text.replace(args[0], ''), col, col2, col3)
  } else {
    image = await textToPicture(text)
  }
  const sticker = await new Sticker(image, {
    pack: process.env.PACKNAME!,
    author: process.env.AUTHOR!,
    type: StickerTypes.FULL,
    quality: 100,
  }).toFile('tmp/sticker-ttp.webp')
  data.reactSuccess()
  await replySticker({ url: sticker })
}

const memefyHandler = async (
  _wa: WASocket,
  _msg: WAMessage,
  data: MessageData
) => {
  const { arg, cmd, isQuoted, isQuotedSticker, isMedia, replySticker } = data
  let _arg = arg
  if (!_arg && !isQuoted && !isQuotedSticker && !isMedia)
    throw new Error(stringId.memefy.usage(data))
  data.reactWait()

  const textLimit = 30
  if (_arg.length > textLimit)
    throw new Error(stringId.memefy.error.textLimit(textLimit))

  let image: Buffer
  if (isQuotedSticker) image = await data.downloadSticker()
  else image = isQuoted ? await data.downloadQuoted() : await data.download()

  let simage = await sharp(image).png()
  if (_arg.includes('-c')) simage.resize(512, 512)
  _arg = _arg.replace('-c', '')
  image = await simage.toBuffer()

  let top = _arg.split('|')[0] || '_'
  let bottom = _arg.split('|')[1] || '_'

  let uploadedImageUrl = await uploadImage(image)
  let memeBuffer = await memegen(top, bottom, uploadedImageUrl)

  if (cmd === 'memefy') {
    data.reactSuccess()
    await data.replyContent({ image: memeBuffer })
  }

  if (cmd === 'sm') {
    const sticker = await new Sticker(memeBuffer, {
      pack: process.env.PACKNAME!,
      author: process.env.AUTHOR!,
      type: StickerTypes.FULL,
      quality: 100,
    }).toBuffer()
    data.reactSuccess()
    await replySticker(sticker)
  }
}
