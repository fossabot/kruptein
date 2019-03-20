'use strict'

class kruptein {

  init(options) {
    if (!options.secret)
      throw Error("Must supply a secret!")

    this.crypto = require('crypto')

    this.flag = options.algorithm.match(/ccm|gcm|ocb/) ? true : false

    this.algorithm = options.algorithm || 'aes-256-gcm'
    this.hashing = options.hashing || 'sha512'
    this.encodeas = options.encodeas || 'binary'

    this.at_size = options.at_size || this._matrix(this.algorithm).at_size
    this.iv_size = options.iv_size || this._matrix(this.algorithm).iv_size
    this.key_size = options.key_size || this._matrix(this.algorithm).key_size

    this.secret = this._derive_key(options.secret) || false
  }


  set(plaintext) {
    let iv, aad, ct, hmac, obj

    iv = this._iv(this.iv_size)
    
    aad = (this.flag) ?
      this._digest(iv+this.secret, JSON.stringify(plaintext),
                   this.hashing, this.encodeas) : false

    ct = this._encrypt(this.secret, JSON.stringify(plaintext), this.algorithm,
                       this.encodeas, iv, aad)

    hmac = this._digest(this.secret, ct.ct, this.hashing, this.encodeas)

    obj = (this.flag) ?
      { hmac: hmac, ct: ct.ct, at: ct.at, aad: aad, iv: iv } : 
      { hmac: hmac, ct: ct.ct, iv: iv }

    return JSON.stringify(obj)
  }
    

  get(ciphertext) {
    let ct, hmac, pt

    if (ciphertext)
      try {
        ct = JSON.parse(ciphertext)
      } catch(err) {
        ct = ciphertext
      }

    hmac = this._digest(this.secret, ct.ct, this.hashing, this.encodeas)

    if (hmac != ct.hmac)
      throw 'Encrypted session was tampered with!'

    if (ct.at)
      ct.at = Buffer.from(ct.at, this.encodeas)

    pt = this._decrypt(this.secret, ct.ct, this.algorithm, this.encodeas,
                       Buffer.from(ct.iv, this.encodeas), ct.at, ct.aad)

    return pt
  }


  _digest(key, obj, hashing, encodeas) {
    let hmac = this.crypto.createHmac(this.hashing, key)
    hmac.setEncoding(encodeas)
    hmac.write(obj)
    hmac.end()
    return hmac.read().toString(encodeas)
  }


  _encrypt(key, pt, algo, encodeas, iv, aad) {
    let cipher, ct, at
    
    cipher = this.crypto.createCipheriv(algo, key, iv, {
      authTagLength: this.at_size
    })

    if (aad) {
      try {
        cipher.setAAD(Buffer.from(aad, encodeas), {
          plaintextLength: Buffer.byteLength(pt)
        })
      } catch(err) {
        throw err
      }
    }

    ct = cipher.update(Buffer.from(pt, this.encodeas), 'utf8', encodeas)
    ct += cipher.final(encodeas)

    if (this.flag) {
      try {
        at = cipher.getAuthTag()
      } catch(err) {
        throw err
      }
    }

    return (at) ? {'ct': ct, 'at': at} : {'ct': ct}
  }


  _decrypt(key, ct, algo, encodeas, iv, at, aad) {
    let cipher, pt
    
    cipher = this.crypto.createDecipheriv(algo, key, iv, {
      authTagLength: this.at_size
    })

    if (at) {
      try {
        cipher.setAuthTag(Buffer.from(at, encodeas))
      } catch(err) {
        throw err
      }
    }

    if (this.flag) {
      try {
        cipher.setAAD(Buffer.from(aad, encodeas), {
          plaintextLength: Buffer.byteLength(ct)
        })
      } catch(err) {
        throw err
      }
    }

    pt = cipher.update(ct, encodeas, 'utf8')
    pt += cipher.final('utf8')

    return pt
  }


  _derive_key(secret) {
    let key, hash, salt, result, derived_key

    hash = this.crypto.createHash(this.hashing)
    hash.update(secret)
    salt = hash.digest()

    salt = (Buffer.isBuffer(salt)) ?
      salt.slice(0, 16) : salt.substr(0, 16)

    key = this.crypto.pbkdf2Sync(secret, salt, 10000, 64, this.hashing)

    return Buffer.from(key.toString(this.encodeas)).slice(0, this.key_size)
  }
  

  _iv(iv_size) {
    let iv = this.crypto.randomBytes(iv_size)

    return Buffer.from(iv.toString(this.encodeas),
      this.encodeas).slice(0, iv_size)
  }
  

  _matrix(algo) {
    let obj = { at_size: 128, iv_size: 16, key_size: 32 }

    if (algo.match(/ccm|ocb|gcm/i))
      obj.iv_size = 12

    if (algo.match(/aes/) && algo.match(/192/))
      obj.key_size = 24

    if (algo.match(/aes/) && algo.match(/128/))
      obj.key_size = 16

    if (algo.match(/aes/) && algo.match(/ecb/))
      obj.iv_size = 0

    if (algo.match(/aes/) && algo.match(/xts/))
      obj.key_size = 32

    if (algo.match(/aes/) && algo.match(/xts/) && algo.match(/256/))
      obj.key_size = 64

    return obj
  }
}


module.exports = new kruptein