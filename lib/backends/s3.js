/**
 * s3 backend for Twilight
 *
 * @author Jared Allard <jaredallard@outlook.com>
 * @license MIT
 * @version 1
 */

const minio = require('triton-core/minio')

/* eslint space-before-function-paren: [0] */

class S3 {
  constructor(bucketName, config) {
    this._client = minio.newClient(config)
    this._bucketName = bucketName
  }

  /**
   * pathExists checks if a path exists
   * @param {String} path file path to check
   * @returns {Boolean} if it exists
   */
  async pathExists(path) {
    try {
      await this._client.statObject(this._bucketName, path)
    } catch (err) {
      return false
    }

    return true
  }

  /**
   * unlink removes a file path
   * @param {String} path file path to unlink
   */
  async unlink(path) {
    const exists = await this.pathExists(path)
    if (!exists) {
      throw new Error(`Failed to find object '${path}'`)
    }

    try {
      await this._client.removeObject(this._bucketName, path)
    } catch (err) {
      throw new Error(`Failed to remove object '${path}': ${err.message}`)
    }
  }

  /**
   * create creates a new file from an existing file
   * @param {String} src file path
   * @param {String} dest file path to put at
   */
  async create(src, dest) {
    const exists = await this.pathExists(dest)
    if (exists) {
      throw new Error(`Object already exists '${dest}'`)
    }

    return this._client.fPutObject(this._bucketName, dest, src)
  }
}

module.exports = S3
