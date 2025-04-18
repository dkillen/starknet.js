/* eslint-disable no-case-declarations */
import {
  AbiEntry,
  AbiEnums,
  AbiStructs,
  Args,
  BigNumberish,
  ByteArray,
  CairoEnum,
  EventEntry,
  ParsedStruct,
} from '../../types';
import { CairoFixedArray } from '../cairoDataTypes/fixedArray';
import { CairoUint256 } from '../cairoDataTypes/uint256';
import { CairoUint512 } from '../cairoDataTypes/uint512';
import { addHexPrefix, removeHexPrefix } from '../encode';
import { toHex } from '../num';
import { decodeShortString } from '../shortString';
import { stringFromByteArray } from './byteArray';
import {
  getArrayType,
  isCairo1Type,
  isLen,
  isTypeArray,
  isTypeBool,
  isTypeByteArray,
  isTypeBytes31,
  isTypeEnum,
  isTypeEthAddress,
  isTypeNonZero,
  isTypeSecp256k1Point,
  isTypeTuple,
} from './cairo';
import {
  CairoCustomEnum,
  CairoEnumRaw,
  CairoOption,
  CairoOptionVariant,
  CairoResult,
  CairoResultVariant,
} from './enum';
import extractTupleMemberTypes from './tuple';

/**
 * Parse base types
 * @param type type of element
 * @param it iterator
 * @returns bigint | boolean
 */
function parseBaseTypes(type: string, it: Iterator<string>) {
  let temp;
  switch (true) {
    case isTypeBool(type):
      temp = it.next().value;
      return Boolean(BigInt(temp));
    case CairoUint256.isAbiType(type):
      const low = it.next().value;
      const high = it.next().value;
      return new CairoUint256(low, high).toBigInt();
    case CairoUint512.isAbiType(type):
      const limb0 = it.next().value;
      const limb1 = it.next().value;
      const limb2 = it.next().value;
      const limb3 = it.next().value;
      return new CairoUint512(limb0, limb1, limb2, limb3).toBigInt();
    case isTypeEthAddress(type):
      temp = it.next().value;
      return BigInt(temp);
    case isTypeBytes31(type):
      temp = it.next().value;
      return decodeShortString(temp);
    case isTypeSecp256k1Point(type):
      const xLow = removeHexPrefix(it.next().value).padStart(32, '0');
      const xHigh = removeHexPrefix(it.next().value).padStart(32, '0');
      const yLow = removeHexPrefix(it.next().value).padStart(32, '0');
      const yHigh = removeHexPrefix(it.next().value).padStart(32, '0');
      const pubK = BigInt(addHexPrefix(xHigh + xLow + yHigh + yLow));
      return pubK;
    default:
      temp = it.next().value;
      return BigInt(temp);
  }
}

/**
 * Parse of the response elements that are converted to Object (Struct) by using the abi
 *
 * @param responseIterator - iterator of the response
 * @param element - element of the field {name: string, type: string}
 * @param structs - structs from abi
 * @param enums
 * @return {any} - parsed arguments in format that contract is expecting
 */
function parseResponseValue(
  responseIterator: Iterator<string>,
  element: { name: string; type: string },
  structs?: AbiStructs,
  enums?: AbiEnums
): BigNumberish | ParsedStruct | boolean | any[] | CairoEnum {
  if (element.type === '()') {
    return {};
  }
  // type uint256 struct (c1v2)
  if (CairoUint256.isAbiType(element.type)) {
    const low = responseIterator.next().value;
    const high = responseIterator.next().value;
    return new CairoUint256(low, high).toBigInt();
  }
  // type uint512 struct
  if (CairoUint512.isAbiType(element.type)) {
    const limb0 = responseIterator.next().value;
    const limb1 = responseIterator.next().value;
    const limb2 = responseIterator.next().value;
    const limb3 = responseIterator.next().value;
    return new CairoUint512(limb0, limb1, limb2, limb3).toBigInt();
  }
  // type C1 ByteArray struct, representing a LongString
  if (isTypeByteArray(element.type)) {
    const parsedBytes31Arr: BigNumberish[] = [];
    const bytes31ArrLen = BigInt(responseIterator.next().value);
    while (parsedBytes31Arr.length < bytes31ArrLen) {
      parsedBytes31Arr.push(toHex(responseIterator.next().value));
    }
    const pending_word = toHex(responseIterator.next().value);
    const pending_word_len = BigInt(responseIterator.next().value);
    const myByteArray: ByteArray = {
      data: parsedBytes31Arr,
      pending_word,
      pending_word_len,
    };
    return stringFromByteArray(myByteArray);
  }

  // type fixed-array
  if (CairoFixedArray.isTypeFixedArray(element.type)) {
    const parsedDataArr: (BigNumberish | ParsedStruct | boolean | any[] | CairoEnum)[] = [];
    const el: AbiEntry = { name: '', type: CairoFixedArray.getFixedArrayType(element.type) };
    const arraySize = CairoFixedArray.getFixedArraySize(element.type);
    while (parsedDataArr.length < arraySize) {
      parsedDataArr.push(parseResponseValue(responseIterator, el, structs, enums));
    }
    return parsedDataArr;
  }

  // type c1 array
  if (isTypeArray(element.type)) {
    // eslint-disable-next-line no-case-declarations
    const parsedDataArr: (BigNumberish | ParsedStruct | boolean | any[] | CairoEnum)[] = [];
    const el: AbiEntry = { name: '', type: getArrayType(element.type) };
    const len = BigInt(responseIterator.next().value); // get length
    while (parsedDataArr.length < len) {
      parsedDataArr.push(parseResponseValue(responseIterator, el, structs, enums));
    }
    return parsedDataArr;
  }

  // type NonZero
  if (isTypeNonZero(element.type)) {
    // eslint-disable-next-line no-case-declarations
    // const parsedDataArr: (BigNumberish | ParsedStruct | boolean | any[] | CairoEnum)[] = [];
    const el: AbiEntry = { name: '', type: getArrayType(element.type) };
    // parsedDataArr.push();
    return parseResponseValue(responseIterator, el, structs, enums);
  }

  // type struct
  if (structs && element.type in structs && structs[element.type]) {
    if (isTypeEthAddress(element.type)) {
      return parseBaseTypes(element.type, responseIterator);
    }
    return structs[element.type].members.reduce((acc, el) => {
      acc[el.name] = parseResponseValue(responseIterator, el, structs, enums);
      return acc;
    }, {} as any);
  }

  // type Enum (only CustomEnum)
  if (enums && element.type in enums && enums[element.type]) {
    const variantNum: number = Number(responseIterator.next().value); // get variant number
    const rawEnum = enums[element.type].variants.reduce((acc, variant, num) => {
      if (num === variantNum) {
        acc[variant.name] = parseResponseValue(
          responseIterator,
          { name: '', type: variant.type },
          structs,
          enums
        );
        return acc;
      }
      acc[variant.name] = undefined;
      return acc;
    }, {} as CairoEnumRaw);
    // Option
    if (element.type.startsWith('core::option::Option')) {
      const content = variantNum === CairoOptionVariant.Some ? rawEnum.Some : undefined;
      return new CairoOption<Object>(variantNum, content);
    }
    // Result
    if (element.type.startsWith('core::result::Result')) {
      let content: Object;
      if (variantNum === CairoResultVariant.Ok) {
        content = rawEnum.Ok;
      } else {
        content = rawEnum.Err;
      }
      return new CairoResult<Object, Object>(variantNum, content);
    }
    // Cairo custom Enum
    const customEnum = new CairoCustomEnum(rawEnum);
    return customEnum;
  }

  // type tuple
  if (isTypeTuple(element.type)) {
    const memberTypes = extractTupleMemberTypes(element.type);
    return memberTypes.reduce((acc, it: any, idx) => {
      const name = it?.name ? it.name : idx;
      const type = it?.type ? it.type : it;
      const el = { name, type };
      acc[name] = parseResponseValue(responseIterator, el, structs, enums);
      return acc;
    }, {} as any);
  }

  // type c1 array
  if (isTypeArray(element.type)) {
    // eslint-disable-next-line no-case-declarations
    const parsedDataArr: (BigNumberish | ParsedStruct | boolean | any[] | CairoEnum)[] = [];
    const el = { name: '', type: getArrayType(element.type) };
    const len = BigInt(responseIterator.next().value); // get length
    while (parsedDataArr.length < len) {
      parsedDataArr.push(parseResponseValue(responseIterator, el, structs, enums));
    }
    return parsedDataArr;
  }

  // base type
  return parseBaseTypes(element.type, responseIterator);
}

/**
 * Parse elements of the response and structuring them into one field by using output property from the abi for that method
 *
 * @param responseIterator - iterator of the response
 * @param output - output(field) information from the abi that will be used to parse the data
 * @param structs - structs from abi
 * @param parsedResult
 * @return - parsed response corresponding to the abi structure of the field
 */
export default function responseParser(
  responseIterator: Iterator<string>,
  output: AbiEntry | EventEntry,
  structs?: AbiStructs,
  enums?: AbiEnums,
  parsedResult?: Args | ParsedStruct
): any {
  const { name, type } = output;
  let temp;

  switch (true) {
    case isLen(name):
      temp = responseIterator.next().value;
      return BigInt(temp);

    case (structs && type in structs) || isTypeTuple(type):
      return parseResponseValue(responseIterator, output, structs, enums);

    case enums && isTypeEnum(type, enums):
      return parseResponseValue(responseIterator, output, structs, enums);

    case CairoFixedArray.isTypeFixedArray(type):
      return parseResponseValue(responseIterator, output, structs, enums);

    case isTypeArray(type):
      // C1 Array
      if (isCairo1Type(type)) {
        return parseResponseValue(responseIterator, output, structs, enums);
      }
      // C0 Array
      // eslint-disable-next-line no-case-declarations
      const parsedDataArr: (BigNumberish | ParsedStruct | boolean | any[] | CairoEnum)[] = [];
      if (parsedResult && parsedResult[`${name}_len`]) {
        const arrLen = parsedResult[`${name}_len`] as number;
        while (parsedDataArr.length < arrLen) {
          parsedDataArr.push(
            parseResponseValue(
              responseIterator,
              { name, type: output.type.replace('*', '') },
              structs,
              enums
            )
          );
        }
      }
      return parsedDataArr;

    case isTypeNonZero(type):
      return parseResponseValue(responseIterator, output, structs, enums);

    default:
      return parseBaseTypes(type, responseIterator);
  }
}
