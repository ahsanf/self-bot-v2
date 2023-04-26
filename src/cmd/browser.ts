import { WAMessage, WASocket } from '@adiwajshing/baileys'
import { actions } from '../handler'
import stringId from '../language'
import { menu } from '../menu'
import { MessageData } from '../utils'
import { browser } from '../..'

export default function () {
  Object.assign(actions, {
    crjogja: crjogjaHandler,
    ddg: ddgSearchHandler,
  })

  stringId.crjogja = {
    hint: '🌐 _Citra radar cuaca di Jogja_',
    error: {
      timeOut: '‼️ Gagal mendapatkan citra radar!',
    },
  }

  stringId.ddg = {
    hint: '🔍 _DuckDuckGo search_',
    error: {
      timeOut: '‼️ Gagal mendapatkan hasil pencarian!',
    },
    usage: (data: MessageData) =>
      `🔍 Cari dengan DuckDuckGo ➡️ ${data.prefix}${data.cmd} <query>`,
  }

  menu.push(
    {
      command: 'crjogja',
      hint: stringId.crjogja.hint,
      alias: 'crj',
      type: 'browser',
    },
    {
      command: 'ddg',
      hint: stringId.ddg.hint,
      alias: 'q, search',
      type: 'browser',
    }
  )
}

const crjogjaHandler = async (
  waSocket: WASocket,
  msg: WAMessage,
  data: MessageData
) => {
  data.reactWait()
  browser
    .takeScreenshot(
      'http://sipora.staklimyogyakarta.com/radar/',
      'tmp/radar.png',
      { width: 600, height: 600 }
    )
    .then((r) => {
      if (!r) {
        data.reactError()
        return data.reply(stringId.crjogja.error.timeOut)
      }

      waSocket.sendMessage(
        data.from,
        { image: { url: 'tmp/radar.png' } },
        { quoted: msg, ephemeralExpiration: data.expiration! }
      )
      return data.reactSuccess()
    })
    .catch((e) => {
      console.log(e)
      data.reactError()
      return data.reply(stringId.crjogja.error.timeOut)
    })
}

const ddgSearchHandler = async (
  waSocket: WASocket,
  msg: WAMessage,
  data: MessageData
) => {
  if (data.args.length === 0) return data.reply(stringId.ddg.usage(data))
  data.reactWait()
  const query = data.args.join(' ')
  const url = `https://duckduckgo.com/?q=${encodeURIComponent(
    query
  )}&hps=1&start=1&ia=web`
  browser
    .takeScreenshot(url, 'tmp/ddg.png', { width: 750, height: 1200 })
    .then((r) => {
      if (!r) {
        data.reactError()
        return data.reply(stringId.ddg.error.timeOut)
      }

      waSocket.sendMessage(
        data.from,
        { image: { url: 'tmp/ddg.png' } },
        { quoted: msg, ephemeralExpiration: data.expiration! }
      )
      return data.reactSuccess()
    })
    .catch((e) => {
      console.log(e)
      data.reactError()
      return data.reply(stringId.ddg.error.timeOut)
    })
}
