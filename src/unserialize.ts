// eslint-disable-next-line import/no-cycle
import Parser from './parser'
import { isInteger, getClass, getIncompleteClass, __PHP_Incomplete_Class, invariant } from './helpers'

export type Options = {
  strict: boolean
  encoding: BufferEncoding
}

function getClassReference(className: string, scope: Record<string, any>, strict: boolean): any {
  let container: any
  const classReference = scope[className]
  invariant(classReference || !strict, `Class ${className} not found in given scope`)
  if (classReference) {
    // @ts-ignore
    container = new (getClass(classReference.prototype))()
  } else {
    container = getIncompleteClass(className)
  }
  return container
}

function unserializePairs(
  parser: Parser,
  length: number,
  scope: Record<string, any>,
  options: Options,
): { key: any; value: any }[] {
  const pairs: ReturnType<typeof unserializePairs> = []
  for (let i = 0; i < length; i += 1) {
    const key = unserializeItem(parser, scope, options)
    parser.seekExpected(';')
    const value = unserializeItem(parser, scope, options)
    if (parser.peekAhead(1) === ';') {
      parser.advance(1)
    }
    pairs.push({ key, value })
  }
  return pairs
}

function unserializeItem(parser: Parser, scope: Record<string, any>, options: Options): any {
  const type = parser.getType()
  if (type === 'null') {
    return null
  }
  if (type === 'int' || type === 'float') {
    const value = parser.readUntil(';')
    let parsedValue: number | BigInt = type === 'int' ? parseInt(value, 10) : parseFloat(value)

    if (parsedValue.toString() !== value) {
      if (!value.includes('.')) {
        parsedValue = BigInt(value) // Only convert to BigInt if there's no decimal
      } else {
        parsedValue = parseFloat(value) // Ensure floats remain as float
      }
    }

    return parsedValue
  }
  if (type === 'boolean') {
    const value = parser.readAhead(1)
    return value === '1'
  }
  if (type === 'string') {
    // this method doesn't provide a descriptive enough error message
    // return parser.getByLength('"', '"', length => parser.readAhead(length))

    const length = this.getByLength()
    this.seekExpected(`:"`)

    const initialIndex = parser.index
    const uncheckedString = parser.readUntil(`"`)
    const finalIndex = parser.index

    if (uncheckedString.length !== length) {
      throw new Error(
        `String length in encoding declared to be ${length} but was actually ${uncheckedString.length}, string was "${uncheckedString}" from index ${initialIndex} to ${finalIndex}`,
        { cause: parser.error(`String length mismatch`) },
      )
    }
    return uncheckedString
  }
  if (type === 'array-object') {
    const pairs = parser.getByLength('{', '}', (length) => unserializePairs(parser, length, scope, options))

    const isArray = pairs.every((item, idx) => isInteger(item.key) && idx === item.key)
    const result = isArray ? [] : {}
    pairs.forEach(({ key, value }) => {
      result[key] = value
    })
    return result
  }
  if (type === 'notserializable-class') {
    const name = parser.getByLength('"', '"', (length) => parser.readAhead(length))
    parser.seekExpected(':')
    const pairs = parser.getByLength('{', '}', (length) => unserializePairs(parser, length, scope, options))
    const result = getClassReference(name, scope, options.strict)

    const PREFIX_PRIVATE = `\u0000${name}\u0000`
    const PREFIX_PROTECTED = `\u0000*\u0000`
    pairs.forEach(({ key, value }) => {
      if (key.startsWith(PREFIX_PRIVATE)) {
        // Private field
        result[key.slice(PREFIX_PRIVATE.length)] = value
      } else if (key.startsWith(PREFIX_PROTECTED)) {
        // Protected field
        result[key.slice(PREFIX_PROTECTED.length)] = value
      } else {
        result[key] = value
      }
    })
    return result
  }
  if (type === 'serializable-class') {
    const name = parser.getByLength('"', '"', (length) => parser.readAhead(length))
    parser.seekExpected(':')
    const payload = parser.getByLength('{', '}', (length) => parser.readAhead(length))
    const result = getClassReference(name, scope, options.strict)
    if (!(result instanceof __PHP_Incomplete_Class)) {
      invariant(result.unserialize, `unserialize not found on class when processing '${name}'`)
      result.unserialize(payload)
    }
    return result
  }
  throw new Error(`Invalid type '${type}' encounterd while unserializing`)
}

function unserialize(item: string | Buffer, scope: Record<string, any> = {}, givenOptions: Partial<Options> = {}): any {
  const options: any = { ...givenOptions }
  if (typeof options.strict === 'undefined') {
    options.strict = true
  }
  if (typeof options.encoding === 'undefined') {
    options.encoding = 'utf8'
  }
  const parser = new Parser(Buffer.from(item), 0, options)
  return unserializeItem(parser, scope, options)
}

export default unserialize
