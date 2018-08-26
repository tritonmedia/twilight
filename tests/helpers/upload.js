const request = require('request-promise-native')
const fs = require('fs')
const path = require('path')

const file = process.argv[2]

console.log('uploading', file)

const init = async function () {
  try {
    const response = await request({
      url: 'http://127.0.0.1:8001/v1/media/1',
      method: 'PUT',
      formData: {
        file: {
          value: fs.createReadStream(file),
          options: {
            filename: path.basename(file),
            contentType: 'video/x-matroska'
          }
        }
      }
    })

    console.log('got', response.body)
  } catch (err) {
    console.log('err', err.message)
    process.exit(1)
  }
}

init()
