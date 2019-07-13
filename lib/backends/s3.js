/**
 * s3 backend for Twilight
 *
 * @author Jared Allard <jaredallard@outlook.com>
 * @license MIT
 * @version 1
 */

const minio = require('triton-core/minio')
const hfs = require('fs-extra')

/* eslint space-before-function-paren: [0] */

class S3 {
  constructor(bucketName, config) {
    this._client = minio.newClient(config)
    this._bucketName = bucketName
    this._bucketExists = null
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
   * Bucket exists checks if a bucket exists or not and then stores
   * the result on this._bucketExists to reduce API calls.
   * @param {String} bucketName bucket to check
   */
  async bucketExists(bucketName) {
    const exists = await this._client.bucketExists(bucketName)
    this._bucketExists = exists
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
    // first init of the var
    if (this._bucketExists === null) {
      await this.bucketExists(this._bucketName)
    }

    // if it doesn't exist, create it
    if (!this._bucketExists) {
      await this._client.makeBucket(this._bucketName, '')
      await this.bucketExists(this._bucketName)
    }

    // check if the path exists in this bucket
    const exists = await this.pathExists(dest)
    if (exists) {
      throw new Error(`Object already exists '${dest}'`)
    }

    // now create it
    await this._client.fPutObject(this._bucketName, dest, src)

    // remove the file to mimic fs behaviour
    await hfs.remove(src)
  }
}

module.exports = S3
