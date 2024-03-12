import {
  Account,
  BigNumberish,
  CairoCustomEnum,
  CairoOption,
  CairoOptionVariant,
  CairoResult,
  CairoResultVariant,
  CallData,
  Calldata,
  CompiledSierra,
  Contract,
  DeclareDeployUDCResponse,
  RawArgsArray,
  RawArgsObject,
  byteArray,
  cairo,
  ec,
  hash,
  num,
  selector,
  shortString,
  stark,
  types,
} from '../src';
import { hexToDecimalString } from '../src/utils/num';
import { encodeShortString } from '../src/utils/shortString';
import {
  TEST_TX_VERSION,
  compiledC1Account,
  compiledC1AccountCasm,
  compiledC1v2,
  compiledC1v2Casm,
  compiledC210,
  compiledC210Casm,
  compiledC240,
  compiledC240Casm,
  compiledC260,
  compiledC260Casm,
  compiledComplexSierra,
  compiledHelloSierra,
  compiledTuple,
  compiledTupleCasm,
  getTestAccount,
  getTestProvider,
} from './config/fixtures';
import { initializeMatcher } from './config/schema';

const { uint256, tuple, isCairo1Abi } = cairo;
const { toHex } = num;
const { starknetKeccak } = selector;

describe('Cairo 1', () => {
  const provider = getTestProvider();
  const account = getTestAccount(provider);
  describe('API &  Contract interactions', () => {
    let dd: DeclareDeployUDCResponse;
    let cairo1Contract: Contract;
    let dd2: DeclareDeployUDCResponse;
    let cairo210Contract: Contract;
    initializeMatcher(expect);

    beforeAll(async () => {
      dd = await account.declareAndDeploy({
        contract: compiledC1v2,
        casm: compiledC1v2Casm,
      });
      cairo1Contract = new Contract(compiledC1v2.abi, dd.deploy.contract_address, account);

      dd2 = await account.declareAndDeploy({
        contract: compiledC210,
        casm: compiledC210Casm,
      });
      cairo210Contract = new Contract(compiledC210.abi, dd2.deploy.contract_address, account);
    });

    test('Declare & deploy v2 - Hello Cairo 1 contract', async () => {
      expect(dd.declare).toMatchSchemaRef('DeclareContractResponse');
      expect(dd.deploy).toMatchSchemaRef('DeployContractUDCResponse');
      expect(cairo1Contract).toBeInstanceOf(Contract);
      expect(cairo210Contract).toBeInstanceOf(Contract);
    });

    test('getCairoVersion', async () => {
      const version1 = await cairo1Contract.getVersion();
      expect(version1).toEqual({ cairo: '1', compiler: '2' });

      const version210 = await cairo210Contract.getVersion();
      expect(version210).toEqual({ cairo: '1', compiler: '2' });
    });

    xtest('validate TS for redeclare - skip testing', async () => {
      const cc0 = await account.getClassAt(dd.deploy.address);
      const cc0_1 = await account.getClassByHash(toHex(dd.declare.class_hash));

      await account.declare({
        contract: cc0 as CompiledSierra,
        casm: compiledC1v2Casm,
      });

      await account.declare({
        contract: cc0_1 as CompiledSierra,
        casm: compiledC1v2Casm,
      });
    });

    test('deployContract Cairo1', async () => {
      const deploy = await account.deployContract({
        classHash: dd.deploy.classHash,
      });
      expect(deploy).toHaveProperty('address');
    });

    test('GetClassByHash', async () => {
      const classResponse = await provider.getClassByHash(dd.deploy.classHash);
      expect(classResponse).toMatchSchemaRef('SierraContractClass');
    });

    test('GetClassAt', async () => {
      const classResponse = await provider.getClassAt(dd.deploy.contract_address);
      expect(classResponse).toMatchSchemaRef('SierraContractClass');
    });

    test('isCairo1', async () => {
      const isContractCairo1 = cairo1Contract.isCairo1();
      expect(isContractCairo1).toBe(true);
      const isAbiCairo1 = isCairo1Abi(cairo1Contract.abi);
      expect(isAbiCairo1).toBe(true);
    });

    test('Cairo 1 Contract Interaction - skip invoke validation & call parsing', async () => {
      const tx = await cairo1Contract.increase_balance(
        CallData.compile({
          amount: 100,
        })
      );
      await account.waitForTransaction(tx.transaction_hash);

      const balance = await cairo1Contract.get_balance({
        parseResponse: false,
      });

      expect(num.toBigInt(balance[0])).toBe(100n);
    });

    test('Cairo 1 Contract Interaction - felt252', async () => {
      const tx = await cairo1Contract.increase_balance(100);
      await account.waitForTransaction(tx.transaction_hash);
      const balance = await cairo1Contract.get_balance();
      expect(balance).toBe(200n);
    });

    test('Cairo 1 Contract Interaction - uint 8, 16, 32, 64, 128, literals', async () => {
      const tx = await cairo1Contract.increase_balance_u8(255n);
      await account.waitForTransaction(tx.transaction_hash);
      const balance = await cairo1Contract.get_balance_u8();
      expect(balance).toBe(255n);

      let result = await cairo1Contract.test_u16(255n);
      expect(result).toBe(256n);
      result = await cairo1Contract.test_u32(255n);
      expect(result).toBe(256n);
      result = await cairo1Contract.test_u64(255n);
      expect(result).toBe(256n);
      result = await cairo1Contract.test_u128(255n);
      expect(result).toBe(256n);
    });

    test('Cairo 1 - uint256', async () => {
      // defined as number
      const result = await cairo1Contract.test_u256(2n ** 256n - 2n);
      expect(result).toBe(2n ** 256n - 1n);

      // defined as struct
      const result1 = await cairo1Contract.test_u256(uint256(2n ** 256n - 2n));
      expect(result1).toBe(2n ** 256n - 1n);

      // using Contract.populate result in meta-class
      const functionParameters: RawArgsObject = { p1: cairo.uint256(15) };
      const myCall0 = cairo1Contract.populate('test_u256', functionParameters);
      const res0 = await cairo1Contract.test_u256(myCall0.calldata);
      expect(res0).toBe(16n);
      const myCall0a = cairo1Contract.populate('test_u256', { p1: 15 });
      const res0a = await cairo1Contract.test_u256(myCall0a.calldata);
      expect(res0a).toBe(16n);
      // using myCallData.compile result in meta-class
      const contractCallData: CallData = new CallData(cairo1Contract.abi);
      const myCalldata: Calldata = contractCallData.compile('test_u256', functionParameters);
      const res1 = await cairo1Contract.test_u256(myCalldata);
      expect(res1).toBe(16n);

      // using CallData.compile result in meta-class
      const contractCallData2: Calldata = CallData.compile(functionParameters);
      const res2 = await cairo1Contract.test_u256(contractCallData2);
      expect(res2).toBe(16n);
    });

    test('Cairo 1 Contract Interaction - bool', async () => {
      const cdata = CallData.compile({ false: false, true: true });
      expect(cdata).toEqual(['0', '1']);

      let tx = await cairo1Contract.set_status(true);
      await account.waitForTransaction(tx.transaction_hash);
      let status = await cairo1Contract.get_status();

      expect(status).toBe(true);

      tx = await cairo1Contract.set_status(false);
      await account.waitForTransaction(tx.transaction_hash);
      status = await cairo1Contract.get_status();

      expect(status).toBe(false);

      tx = await cairo1Contract.set_status(true);
      await account.waitForTransaction(tx.transaction_hash);
      status = await cairo1Contract.get_status();

      expect(status).toBe(true);
    });

    test('Cairo 1 Contract Interaction - ContractAddress, ClassHash, EthAddress', async () => {
      const tx = await cairo1Contract.set_ca('123');
      await account.waitForTransaction(tx.transaction_hash);
      const status = await cairo1Contract.get_ca();
      expect(status).toBe(123n);

      // new types Cairo v2.0.0
      const compiled = cairo1Contract.populate('new_types', {
        ch: 123456789n,
        eth_addr: 987654321n,
        contr_address: 657563474357n,
      });
      const result = await cairo1Contract.call('new_types', compiled.calldata as Calldata);
      expect(result).toStrictEqual({ '0': 123456789n, '1': 987654321n, '2': 657563474357n });

      const myCalldata = new CallData(compiledC1v2.abi); // test arrays
      const compiled2 = myCalldata.compile('array_new_types', {
        tup: cairo.tuple(256, '0x1234567890', '0xe3456'),
        tupa: cairo.tuple(
          ['0x1234567890', '0xe3456'], // ContractAddress
          ['0x1234567891', '0xe3457'], // EthAddress
          ['0x1234567892', '0xe3458'] // ClassHash
        ),
      });
      const res1 = await cairo1Contract.call('array_new_types', compiled2);
      expect(res1).toStrictEqual({
        '0': [78187493520n, 930902n],
        '1': [78187493521n, 930903n],
        '2': [78187493522n, 930904n],
      });
      const res2 = await cairo1Contract.call('array_contract_addr', [['0x1234567892', '0xe3458']]);
      expect(res2).toStrictEqual([78187493522n, 930904n]);
    });

    test('Cairo1 simple getStorageAt variables retrieval', async () => {
      // u8
      let tx = await cairo1Contract.increase_balance(100);
      await account.waitForTransaction(tx.transaction_hash);
      const balance = await cairo1Contract.get_balance();
      let key = starknetKeccak('balance');
      let storage = await account.getStorageAt(cairo1Contract.address, key);
      expect(BigInt(storage)).toBe(balance);

      // felt
      tx = await cairo1Contract.set_ca('123');
      await account.waitForTransaction(tx.transaction_hash);
      const ca = await cairo1Contract.get_ca();
      key = starknetKeccak('ca');
      storage = await account.getStorageAt(cairo1Contract.address, key);
      expect(BigInt(storage)).toBe(ca);

      // bool
      tx = await cairo1Contract.set_status(true);
      await account.waitForTransaction(tx.transaction_hash);
      const status = await cairo1Contract.get_status();
      key = starknetKeccak('status');
      storage = await account.getStorageAt(cairo1Contract.address, key);
      expect(Boolean(BigInt(storage))).toBe(status);

      // simple struct
      tx = await cairo1Contract.set_user1({
        address: '0x54328a1075b8820eb43caf0caa233923148c983742402dcfc38541dd843d01a',
        is_claimed: true,
      });
      await account.waitForTransaction(tx.transaction_hash);
      const user = await cairo1Contract.get_user1();
      key = starknetKeccak('user1');
      const storage1 = await account.getStorageAt(cairo1Contract.address, key);
      const storage2 = await account.getStorageAt(cairo1Contract.address, key + 1n);
      expect(BigInt(storage1)).toBe(user.address);
      expect(Boolean(BigInt(storage2))).toBe(user.is_claimed);

      // TODO: Complex mapping - https://docs.starknet.io/documentation/architecture_and_concepts/Contracts/contract-storage/
    });

    test('Cairo 1 Contract Interaction - echo flat un-named un-nested tuple', async () => {
      const status = await cairo1Contract.echo_un_tuple(tuple(77, 123));
      expect(Object.values(status)).toEqual([77n, 123n]);
    });

    test('Cairo 1 Contract Interaction - echo flat un-nested Array u8, uint256, bool', async () => {
      const status = await cairo1Contract.echo_array([123, 55, 77, 255]);
      expect(status).toEqual([123n, 55n, 77n, 255n]);

      // uint256 defined as number
      const status1 = await cairo1Contract.echo_array_u256([123, 55, 77, 255]);
      expect(status1).toEqual([123n, 55n, 77n, 255n]);

      // uint256 defined as struct
      const status11 = await cairo1Contract.echo_array_u256([
        uint256(123),
        uint256(55),
        uint256(77),
        uint256(255),
      ]);
      expect(status11).toEqual([123n, 55n, 77n, 255n]);

      const status2 = await cairo1Contract.echo_array_bool([true, true, false, false]);
      expect(status2).toEqual([true, true, false, false]);

      // Span type
      const comp = cairo1Contract.populate('new_span', { my_span: [1, 2, 3] });
      const resp = await cairo1Contract.call('new_span', comp.calldata as Calldata);
      expect(resp).toEqual([1n, 2n, 3n]);
    });

    test('Cairo 1 Contract Interaction - echo flat un-nested Struct', async () => {
      const status = await cairo1Contract.echo_struct({
        val: 'simple',
      });
      expect(shortString.decodeShortString(status.val)).toBe('simple');
    });

    test('Cairo 1 more complex structs', async () => {
      const tx = await cairo1Contract.set_bet();
      await account.waitForTransaction(tx.transaction_hash);
      const status = await cairo1Contract.get_bet(1, {
        formatResponse: { name: 'string', description: 'string' },
      });

      const expected = {
        name: 'test',
        description: 'dec',
        expire_date: 1n,
        creation_time: 1n,
        creator: BigInt(account.address),
        is_cancelled: false,
        is_voted: false,
        bettor: {
          address: BigInt(account.address),
          is_claimed: false,
        },
        counter_bettor: {
          address: BigInt(account.address),
          is_claimed: false,
        },
        winner: false,
        pool: 10n,
        amount: 1000n,
      };
      expect(expected).toEqual(status);
    });

    test('C1 Array 2D', async () => {
      const cd = CallData.compile({
        test: [
          [1, 2],
          [3, 4],
        ],
      });

      const tx = await cairo1Contract.array2d_ex([
        [1, 2],
        [3, 4],
      ]);
      await account.waitForTransaction(tx.transaction_hash);
      const tx1 = await cairo1Contract.array2d_ex(cd);
      await account.waitForTransaction(tx1.transaction_hash);

      const result0 = await cairo1Contract.array2d_felt([
        [1, 2],
        [3, 4],
      ]);
      const result01 = await cairo1Contract.array2d_felt(cd);
      expect(result0).toBe(1n);
      expect(result0).toBe(result01);

      const result1 = await cairo1Contract.array2d_array([
        [1, 2],
        [3, 4],
      ]);
      const result11 = await cairo1Contract.array2d_array(cd);
      expect(result1).toEqual([
        [1n, 2n],
        [3n, 4n],
      ]);
      expect(result1).toEqual(result11);
    });

    test('mix tuples', async () => {
      const res = await cairo1Contract.array_bool_tuple([1, 2, 3], true);
      expect(res).toEqual({
        0: [1n, 2n, 3n, 1n, 2n],
        1: true,
      });

      const res1 = await cairo1Contract.tuple_echo(tuple([1, 2, 3], [4, 5, 6]));
      expect(res1).toEqual({
        0: [1n, 2n, 3n],
        1: [4n, 5n, 6n],
      });
    });

    test('CairoEnums', async () => {
      type Order = {
        p1: BigNumberish;
        p2: BigNumberish;
      };
      // return a Cairo Custom Enum
      const myCairoEnum: CairoCustomEnum = await cairo1Contract.my_enum_output(50);
      expect(myCairoEnum.unwrap()).toEqual(3n);
      expect(myCairoEnum.activeVariant()).toEqual('Error');

      const myCairoEnum2: CairoCustomEnum = await cairo1Contract.my_enum_output(100);
      expect(myCairoEnum2.unwrap()).toEqual(BigInt(shortString.encodeShortString('attention:100')));
      expect(myCairoEnum2.activeVariant()).toEqual('Warning');

      const myCairoEnum3: CairoCustomEnum = await cairo1Contract.my_enum_output(150);
      const res: Order = myCairoEnum3.unwrap();
      expect(res).toEqual({ p1: 1n, p2: 150n });
      expect(myCairoEnum3.activeVariant()).toEqual('Response');

      // Send a Cairo Custom Enum
      const res2 = (await cairo1Contract.call('my_enum_input', [
        new CairoCustomEnum({ Error: 100 }),
      ])) as bigint;
      const myOrder: Order = { p1: 100, p2: 200 };
      const res3 = (await cairo1Contract.my_enum_input(
        new CairoCustomEnum({ Response: myOrder })
      )) as bigint;
      expect(res2).toEqual(100n);
      expect(res3).toEqual(200n);

      const comp2 = CallData.compile([
        new CairoCustomEnum({
          Response: undefined,
          Warning: undefined,
          Error: 100,
        }),
      ]);
      const res2a = (await cairo1Contract.call('my_enum_input', comp2)) as bigint;
      const comp3 = CallData.compile([
        new CairoCustomEnum({
          Response: myOrder,
          Warning: undefined,
          Error: undefined,
        }),
      ]);
      const res3a = (await cairo1Contract.my_enum_input(comp3)) as bigint;
      expect(res2a).toEqual(100n);
      expect(res3a).toEqual(200n);

      const comp2b = cairo1Contract.populate('my_enum_input', {
        customEnum: new CairoCustomEnum({ Error: 100 }),
      });
      const res2b = (await cairo1Contract.call(
        'my_enum_input',
        comp2b.calldata as Calldata
      )) as bigint;
      const comp3b = cairo1Contract.populate('my_enum_input', {
        customEnum: new CairoCustomEnum({ Response: myOrder }),
      });
      const res3b = (await cairo1Contract.my_enum_input(comp3b.calldata)) as bigint;
      expect(res2b).toEqual(100n);
      expect(res3b).toEqual(200n);

      // return a Cairo Option
      const myCairoOption: CairoOption<Order> = await cairo1Contract.option_order_output(50);
      expect(myCairoOption.unwrap()).toEqual(undefined);
      expect(myCairoOption.isNone()).toEqual(true);
      expect(myCairoOption.isSome()).toEqual(false);

      const myCairoOption2: CairoOption<Order> = await cairo1Contract.option_order_output(150);
      expect(myCairoOption2.unwrap()).toEqual({ p1: 18n, p2: 150n });
      expect(myCairoOption2.isNone()).toEqual(false);
      expect(myCairoOption2.isSome()).toEqual(true);

      // send a Cairo Option
      const cairoOption1 = new CairoOption<Order>(CairoOptionVariant.None);
      const res4 = (await cairo1Contract.call('option_order_input', [cairoOption1])) as bigint;
      const comp4a = CallData.compile([cairoOption1]);
      const res4a = (await cairo1Contract.call('option_order_input', comp4a)) as bigint;
      const res5 = (await cairo1Contract.option_order_input(
        new CairoOption<Order>(CairoOptionVariant.Some, myOrder)
      )) as bigint;
      const res5a = (await cairo1Contract.option_order_input(
        CallData.compile([new CairoOption<Order>(CairoOptionVariant.Some, myOrder)])
      )) as bigint;
      expect(res4).toEqual(17n);
      expect(res4a).toEqual(17n);
      expect(res5).toEqual(200n);
      expect(res5a).toEqual(200n);

      // return a Cairo Result
      const myCairoResult: CairoResult<Order, BigNumberish> =
        await cairo1Contract.enum_result_output(50);
      expect(myCairoResult.unwrap()).toEqual(14n);
      expect(myCairoResult.isErr()).toEqual(true);
      expect(myCairoResult.isOk()).toEqual(false);

      const myCairoResult2: CairoResult<Order, BigNumberish> =
        await cairo1Contract.enum_result_output(150);
      expect(myCairoResult2.unwrap()).toEqual({ p1: 8n, p2: 150n });
      expect(myCairoResult2.isErr()).toEqual(false);
      expect(myCairoResult2.isOk()).toEqual(true);

      // send a Cairo Result
      const cairoResult1 = new CairoResult<Order, BigNumberish>(CairoResultVariant.Err, 18n);
      const res6 = (await cairo1Contract.call('enum_result_input', [cairoResult1])) as bigint;
      const comp6a = CallData.compile([cairoResult1]);
      const res6a = (await cairo1Contract.call('enum_result_input', comp6a)) as bigint;
      const res7 = (await cairo1Contract.enum_result_input(
        new CairoResult<Order, BigNumberish>(CairoResultVariant.Ok, myOrder)
      )) as bigint;
      const res7a = (await cairo1Contract.enum_result_input(
        CallData.compile([new CairoResult<Order, BigNumberish>(CairoResultVariant.Ok, myOrder)])
      )) as bigint;
      expect(res6).toEqual(18n);
      expect(res6a).toEqual(18n);
      expect(res7).toEqual(200n);
      expect(res7a).toEqual(200n);
    });

    test('Cairo 2.1.0 simple contract', async () => {
      const res = await cairo210Contract.test_felt(1, 100, 3);
      expect(res).toEqual(101n);

      const call1 = cairo210Contract.populate('test_len', { p1: 100, string_len: 200 });
      expect(call1.calldata).toEqual(['100', '200']);
    });

    test('myCallData.compile for Cairo 1', async () => {
      const myFalseUint256 = { high: 1, low: 23456 }; // wrong order
      type Order2 = {
        p1: BigNumberish;
        p2: BigNumberish[];
      };

      const myOrder2bis: Order2 = {
        // wrong order
        p2: [234, 467456745457n, '0x56ec'],
        p1: '17',
      };
      const myRawArgsObject: RawArgsObject = {
        // wrong order
        active: true,
        symbol: 'NIT',
        initial_supply: myFalseUint256,
        recipient: '0x7e00d496e324876bbc8531f2d9a82bf154d1a04a50218ee74cdd372f75a551a',
        decimals: 18,
        tupoftup: tuple(tuple(34, '0x5e'), myFalseUint256),
        card: myOrder2bis,
        longText: 'Bug is back, for ever, here and everywhere',
        array1: [100, 101, 102],
        array2: [
          [200, 201],
          [202, 203],
          [204, 205],
        ],
        array3: [myOrder2bis, myOrder2bis],
        array4: [myFalseUint256, myFalseUint256],
        tuple1: tuple(40000n, myOrder2bis, [54, 55n, '0xae'], 'texte'),
        name: 'niceToken',
        array5: [tuple(251, 40000n), tuple(252, 40001n)],
      };
      const myRawArgsArray: RawArgsArray = [
        'niceToken',
        'NIT',
        18,
        { low: 23456, high: 1 },
        { p1: '17', p2: [234, 467456745457n, '0x56ec'] },
        '0x7e00d496e324876bbc8531f2d9a82bf154d1a04a50218ee74cdd372f75a551a',
        true,
        { '0': { '0': 34, '1': '0x5e' }, '1': { low: 23456, high: 1 } },
        'Bug is back, for ever, here and everywhere',
        [100, 101, 102],
        [
          [200, 201],
          [202, 203],
          [204, 205],
        ],
        [
          { p1: '17', p2: [234, 467456745457n, '0x56ec'] },
          { p1: '17', p2: [234, 467456745457n, '0x56ec'] },
        ],
        [
          { low: 23456, high: 1 },
          { low: 23456, high: 1 },
        ],
        {
          '0': 40000n,
          '1': { p1: '17', p2: [234, 467456745457n, '0x56ec'] },
          '2': [54, 55n, '0xae'],
          '3': 'texte',
        },
        [
          { '0': 251, '1': 40000n },
          { '0': 252, '1': 40001n },
        ],
      ];

      const contractCallData: CallData = new CallData(compiledComplexSierra.abi);
      const callDataFromObject: Calldata = contractCallData.compile('constructor', myRawArgsObject);
      const callDataFromArray: Calldata = contractCallData.compile('constructor', myRawArgsArray);
      const expectedResult = [
        '2036735872918048433518',
        '5130580',
        '18',
        '23456',
        '1',
        '17',
        '3',
        '234',
        '467456745457',
        '22252',
        '3562055384976875123115280411327378123839557441680670463096306030682092229914',
        '1',
        '34',
        '94',
        '23456',
        '1',
        '2',
        '117422190885827407409664260607192623408641871979684112605616397634538401380',
        '39164769268277364419555941',
        '3',
        '100',
        '101',
        '102',
        '3',
        '2',
        '200',
        '201',
        '2',
        '202',
        '203',
        '2',
        '204',
        '205',
        '2',
        '17',
        '3',
        '234',
        '467456745457',
        '22252',
        '17',
        '3',
        '234',
        '467456745457',
        '22252',
        '2',
        '23456',
        '1',
        '23456',
        '1',
        '40000',
        '0',
        '17',
        '3',
        '234',
        '467456745457',
        '22252',
        '3',
        '54',
        '55',
        '174',
        '499918599269',
        '2',
        '251',
        '40000',
        '252',
        '40001',
      ];
      expect(callDataFromObject).toStrictEqual(expectedResult);
      expect(callDataFromArray).toStrictEqual(expectedResult);
    });

    test('myCallData.decodeParameters for Cairo 1', async () => {
      const Cairo1HelloAbi = compiledHelloSierra;
      const Cairo1Abi = compiledC1v2;
      const helloCallData = new CallData(Cairo1HelloAbi.abi);
      const c1v2CallData = new CallData(Cairo1Abi.abi);

      const res2 = helloCallData.decodeParameters('hello::hello::UserData', ['0x123456', '0x1']);
      expect(res2).toEqual({ address: 1193046n, is_claimed: true });
      const res3 = helloCallData.decodeParameters(
        ['hello::hello::UserData', 'hello::hello::UserData'],
        ['0x123456', '0x1', '0x98765', '0x0']
      );
      expect(res3).toEqual([
        { address: 1193046n, is_claimed: true },
        { address: 624485n, is_claimed: false },
      ]);
      const res4 = helloCallData.decodeParameters('core::integer::u8', ['0x123456']);
      expect(res4).toBe(1193046n);
      const res5 = helloCallData.decodeParameters('core::bool', ['0x1']);
      expect(res5).toBe(true);
      const res6 = helloCallData.decodeParameters('core::felt252', ['0x123456']);
      expect(res6).toBe(1193046n);
      const res7 = helloCallData.decodeParameters('core::integer::u256', ['0x123456', '0x789']);
      expect(num.toHex(res7.toString())).toBe('0x78900000000000000000000000000123456');
      const res8 = helloCallData.decodeParameters('core::array::Array::<core::integer::u16>', [
        '2',
        '0x123456',
        '0x789',
      ]);
      expect(res8).toEqual([1193046n, 1929n]);
      const res9 = helloCallData.decodeParameters('core::array::Span::<core::integer::u16>', [
        '2',
        '0x123456',
        '0x789',
      ]);
      expect(res9).toEqual([1193046n, 1929n]);
      const res10 = helloCallData.decodeParameters('(core::felt252, core::integer::u16)', [
        '0x123456',
        '0x789',
      ]);
      expect(res10).toEqual({ '0': 1193046n, '1': 1929n });
      const res11 = helloCallData.decodeParameters('core::starknet::eth_address::EthAddress', [
        '0x123456',
      ]);
      expect(res11).toBe(1193046n);
      const res12 = helloCallData.decodeParameters(
        'core::starknet::contract_address::ContractAddress',
        ['0x123456']
      );
      expect(res12).toBe(1193046n);
      const res13 = helloCallData.decodeParameters('core::starknet::class_hash::ClassHash', [
        '0x123456',
      ]);
      expect(res13).toBe(1193046n);
      const res14 = c1v2CallData.decodeParameters('core::option::Option::<core::integer::u8>', [
        '0',
        '0x12',
      ]);
      expect(res14).toEqual({ Some: 18n, None: undefined });
      const res15 = c1v2CallData.decodeParameters(
        'core::result::Result::<hello_res_events_newTypes::hello_res_events_newTypes::Order, core::integer::u16>',
        ['0', '0x12', '0x345']
      );
      expect(res15).toEqual({ Ok: { p1: 18n, p2: 837n }, Err: undefined });
      const res16 = c1v2CallData.decodeParameters(
        'hello_res_events_newTypes::hello_res_events_newTypes::MyEnum',
        ['0', '0x12', '0x5678']
      );
      expect(res16).toEqual({
        variant: {
          Response: { p1: 18n, p2: 22136n },
          Warning: undefined,
          Error: undefined,
        },
      });
    });
  });

  describe('Cairo1 Account contract', () => {
    let accountC1: Account;

    beforeAll(async () => {
      // Deploy Cairo 1 Account
      const priKey = stark.randomAddress();
      const pubKey = ec.starkCurve.getStarkKey(priKey);

      const calldata = { publicKey: pubKey };

      // declare account
      const declareAccount = await account.declareIfNot({
        contract: compiledC1Account,
        casm: compiledC1AccountCasm,
      });
      if (declareAccount.transaction_hash) {
        await account.waitForTransaction(declareAccount.transaction_hash);
      }
      const accountClassHash = declareAccount.class_hash;

      // fund new account
      const toBeAccountAddress = hash.calculateContractAddressFromHash(
        pubKey,
        accountClassHash,
        calldata,
        0
      );
      const devnetERC20Address =
        '0x49D36570D4E46F48E99674BD3FCC84644DDD6B96F7C741B1562B82F9E004DC7';
      const { transaction_hash } = await account.execute({
        contractAddress: devnetERC20Address,
        entrypoint: 'transfer',
        calldata: {
          recipient: toBeAccountAddress,
          amount: uint256(5 * 10 ** 15),
        },
      });
      await account.waitForTransaction(transaction_hash);

      // deploy account
      accountC1 = new Account(provider, toBeAccountAddress, priKey, '1', TEST_TX_VERSION);
      const deployed = await accountC1.deploySelf({
        classHash: accountClassHash,
        constructorCalldata: calldata,
        addressSalt: pubKey,
      });
      const receipt = await account.waitForTransaction(deployed.transaction_hash);
      expect(receipt).toMatchSchemaRef('GetTransactionReceiptResponse');
    });

    test('deploy Cairo1 Account from Cairo0 Account', () => {
      expect(accountC1).toBeInstanceOf(Account);
    });
  });

  describe('Event Parsing', () => {
    let eventContract: Contract;
    const simpleKeyVariable = 0n;
    const simpleKeyStruct = {
      first: 1n,
      second: 2n,
    };
    const simpleKeyArray = [3n, 4n, 5n];
    const simpleDataVariable = 6n;
    const simpleDataStruct = {
      first: 7n,
      second: 8n,
    };
    const simpleDataArray = [9n, 10n, 11n];
    const nestedKeyStruct = {
      simpleStruct: {
        first: 0n,
        second: 1n,
      },
      simpleArray: [2n, 3n, 4n, 5n],
    };
    const nestedDataStruct = {
      simpleStruct: {
        first: 6n,
        second: 7n,
      },
      simpleArray: [8n, 9n, 10n, 11n],
    };
    beforeAll(async () => {
      const { deploy } = await account.declareAndDeploy({
        contract: compiledC1v2,
        casm: compiledC1v2Casm,
      });

      eventContract = new Contract(compiledC1v2.abi, deploy.contract_address!, account);
    });

    test('parse event returning a regular struct', async () => {
      const { transaction_hash } = await eventContract.emitEventRegular(
        simpleKeyVariable,
        simpleKeyStruct,
        simpleKeyArray,
        simpleDataVariable,
        simpleDataStruct,
        simpleDataArray
      );
      const shouldBe: types.ParsedEvents = [
        {
          EventRegular: {
            simpleKeyVariable,
            simpleKeyStruct,
            simpleKeyArray,
            simpleDataVariable,
            simpleDataStruct,
            simpleDataArray,
          },
        },
      ];
      const tx = await provider.waitForTransaction(transaction_hash);
      const events = eventContract.parseEvents(tx);
      return expect(events).toStrictEqual(shouldBe);
    });

    test('parse event returning a nested struct', async () => {
      const { transaction_hash } = await eventContract.emitEventNested(
        nestedKeyStruct,
        nestedDataStruct
      );
      const shouldBe: types.ParsedEvents = [
        {
          EventNested: {
            nestedKeyStruct,
            nestedDataStruct,
          },
        },
      ];
      const tx = await provider.waitForTransaction(transaction_hash);
      const events = eventContract.parseEvents(tx);
      return expect(events).toStrictEqual(shouldBe);
    });

    test('parse tx returning multiple similar events', async () => {
      const anotherKeyVariable = 100n;
      const shouldBe: types.ParsedEvents = [
        {
          EventRegular: {
            simpleKeyVariable,
            simpleKeyStruct,
            simpleKeyArray,
            simpleDataVariable,
            simpleDataStruct,
            simpleDataArray,
          },
        },
        {
          EventRegular: {
            simpleKeyVariable: anotherKeyVariable,
            simpleKeyStruct,
            simpleKeyArray,
            simpleDataVariable,
            simpleDataStruct,
            simpleDataArray,
          },
        },
      ];
      const callData1 = eventContract.populate('emitEventRegular', [
        simpleKeyVariable,
        simpleKeyStruct,
        simpleKeyArray,
        simpleDataVariable,
        simpleDataStruct,
        simpleDataArray,
      ]);
      const callData2 = eventContract.populate('emitEventRegular', [
        anotherKeyVariable,
        simpleKeyStruct,
        simpleKeyArray,
        simpleDataVariable,
        simpleDataStruct,
        simpleDataArray,
      ]);
      const { transaction_hash } = await account.execute([callData1, callData2]);
      const tx = await provider.waitForTransaction(transaction_hash);
      const events = eventContract.parseEvents(tx);
      return expect(events).toStrictEqual(shouldBe);
    });
    test('parse tx returning multiple different events', async () => {
      const shouldBe: types.ParsedEvents = [
        {
          EventRegular: {
            simpleKeyVariable,
            simpleKeyStruct,
            simpleKeyArray,
            simpleDataVariable,
            simpleDataStruct,
            simpleDataArray,
          },
        },
        {
          EventNested: {
            nestedKeyStruct,
            nestedDataStruct,
          },
        },
      ];
      const callData1 = eventContract.populate('emitEventRegular', [
        simpleKeyVariable,
        simpleKeyStruct,
        simpleKeyArray,
        simpleDataVariable,
        simpleDataStruct,
        simpleDataArray,
      ]);
      const callData2 = eventContract.populate('emitEventNested', [
        nestedKeyStruct,
        nestedDataStruct,
      ]);
      const { transaction_hash } = await account.execute([callData1, callData2]);
      const tx = await provider.waitForTransaction(transaction_hash);
      const events = eventContract.parseEvents(tx);
      return expect(events).toStrictEqual(shouldBe);
    });
  });

  describe('cairo v2.4.0 new types', () => {
    let stringContract: Contract;

    beforeAll(async () => {
      const { deploy } = await account.declareAndDeploy({
        contract: compiledC240,
        casm: compiledC240Casm,
      });

      stringContract = new Contract(compiledC240.abi, deploy.contract_address, account);
    });

    test('bytes31', async () => {
      const resp = await stringContract.call('proceed_bytes31', ['AZERTY']);
      expect(resp).toBe('AZERTY');
      const str = 'TokenName';
      const callD1 = CallData.compile([str]);
      expect(callD1).toEqual([hexToDecimalString(encodeShortString(str))]);
      const callD2 = CallData.compile({ str });
      expect(callD2).toEqual([hexToDecimalString(encodeShortString(str))]);
      const myCallData = new CallData(compiledC240.abi);
      const myCalldata1 = myCallData.compile('proceed_bytes31', [str]);
      expect(myCalldata1).toEqual([encodeShortString(str)]);
      const myCalldata2 = myCallData.compile('proceed_bytes31', { str });
      expect(myCalldata2).toEqual([encodeShortString(str)]);
      const myCall1 = stringContract.populate('proceed_bytes31', [str]);
      expect(myCall1.calldata).toEqual([encodeShortString(str)]);
      const myCall2 = stringContract.populate('proceed_bytes31', { str });
      expect(myCall2.calldata).toEqual([encodeShortString(str)]);
    });

    test('bytes31 too long', async () => {
      await expect(stringContract.call('proceed_bytes31', ['ABCDEFGHIJKLMNOPQRSTUVWXYZ12345A'])) // more than 31 characters
        .rejects.toThrow();
    });

    test('ByteArray', async () => {
      const message = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ12345AAADEFGHIJKLMNOPQRSTUVWXYZ12345A';
      const callD = CallData.compile([message]);
      const expectedResult = [
        '2',
        hexToDecimalString('0x4142434445464748494a4b4c4d4e4f505152535455565758595a3132333435'),
        hexToDecimalString('0x4141414445464748494a4b4c4d4e4f505152535455565758595a3132333435'),
        hexToDecimalString('0x41'),
        '1',
      ];
      expect(callD).toEqual(expectedResult);
      const callD2 = CallData.compile({ mess: message });
      expect(callD2).toEqual(expectedResult);
      const callD3 = CallData.compile({ mess: byteArray.byteArrayFromString('Take care.') });
      expect(callD3).toEqual(['1', '0', '398475857363345939260718', '10']);
      const str1 = await stringContract.get_string();
      expect(str1).toBe(
        "Cairo has become the most popular language for developers + charizards !@#$%^&*_+|:'<>?~`"
      );
      const myCallData = new CallData(stringContract.abi);
      const expectedString = 'Take care. Zorg is back';
      const resp3 = await stringContract.proceed_string('Take care.');
      expect(resp3).toBe(expectedString);
      const resp4 = await stringContract.call('proceed_string', ['Take care.']);
      expect(resp4).toBe(expectedString);
      const calldata1 = myCallData.compile('proceed_string', ['Take care.']);
      const resp5 = await stringContract.call('proceed_string', calldata1);
      expect(resp5).toBe(expectedString);
    });
  });

  describe('cairo v2.5.3 complex tuples', () => {
    let tupleContract: Contract;
    let myCallData: CallData;

    beforeAll(async () => {
      const { deploy } = await account.declareAndDeploy({
        contract: compiledTuple,
        casm: compiledTupleCasm,
      });

      tupleContract = new Contract(compiledTuple.abi, deploy.contract_address, account);
      myCallData = new CallData(tupleContract.abi);
    });

    test('Tuple (u8, Array<u16>, bool)', async () => {
      const res1 = await tupleContract.call('get_tuple1', []);
      expect(res1).toEqual({ '0': 100n, '1': [5000n, 6000n], '2': true });
    });

    test('Tuple (bytes31, ByteArray)', async () => {
      const res2 = await tupleContract.call('get_tuple2', []);
      expect(res2).toEqual({
        '0': 'Input',
        '1': 'Zorg is very verbose and creates only long sentences.',
      });
    });

    test('Tuple (u256, Order2)', async () => {
      const res3 = await tupleContract.call('get_tuple3', []);
      expect(res3).toEqual({ '0': 123456n, '1': { p1: 10n, p2: [1n, 2n, 3n] } });
    });

    test('Tuple (EthAddress, u256)', async () => {
      const res4 = await tupleContract.call('get_tuple4', []);
      expect(res4).toEqual({ '0': 123n, '1': 500n });
    });

    test('Tuple (Result<u64, u8>, u8)', async () => {
      const res5 = await tupleContract.call('get_tuple5', []);
      expect(res5).toEqual({
        '0': new CairoResult<BigNumberish, BigNumberish>(CairoResultVariant.Ok, 18n),
        '1': 4n,
      });
    });

    test('Tuple (Option<u64>, u8)', async () => {
      const res6 = await tupleContract.call('get_tuple6', []);
      expect(res6).toEqual({
        '0': new CairoOption<BigNumberish>(CairoOptionVariant.Some, 18n),
        '1': 4n,
      });
    });

    test('Tuple (Cairo enum.North, u8)', async () => {
      const res7 = await tupleContract.call('get_tuple7', []);
      expect(res7).toEqual({
        '0': new CairoCustomEnum({ North: {}, East: undefined }),
        '1': 4n,
      });
    });

    test('Tuple (Cairo enum.East, u8)', async () => {
      const res12 = await tupleContract.call('get_tuple12', []);
      expect(res12).toEqual({
        '0': new CairoCustomEnum({
          North: undefined,
          East: new CairoResult<BigNumberish, BigNumberish>(CairoResultVariant.Ok, 2000n),
        }),
        '1': 4n,
      });
    });

    test('Tuple ((u256, Array<u16>), u8)', async () => {
      const res8 = await tupleContract.call('get_tuple8', []);
      expect(res8).toEqual({ '0': { '0': 600n, '1': [1n, 2n, 3n] }, '1': 8n });
    });

    test('Tuple ((u256,(u16,Order2)), u8)', async () => {
      type Order2 = {
        p1: num.BigNumberish;
        p2: num.BigNumberish[];
      };
      const myOrder2: Order2 = { p1: 100, p2: [5, 6, 7] };
      const calldata9 = myCallData.compile('get_tuple9', {
        l0: cairo.tuple(cairo.tuple(cairo.uint256(5000n), cairo.tuple(250, myOrder2)), 240),
      });
      const res9 = await tupleContract.call('get_tuple9', calldata9);
      expect(res9).toEqual({
        '0': {
          '0': 5000n,
          '1': { '0': 250n, '1': { p1: 100n, p2: [5n, 6n, 7n] } },
        },
        '1': 240n,
      });
    });

    test('Array Array<Result<u256, u8>>', async () => {
      const res10 = await tupleContract.call('get_tuple10', []);
      expect(res10).toEqual({
        '0': 8000n,
        '1': [
          new CairoResult<BigNumberish, BigNumberish>(CairoResultVariant.Ok, 6000n),
          new CairoResult<BigNumberish, BigNumberish>(CairoResultVariant.Ok, 7000n),
        ],
      });
    });

    test('Option Option<Result<u16, felt252>>', async () => {
      const res11 = await tupleContract.call('get_tuple11', []);
      expect(res11).toEqual({
        '0': 400n,
        '1': new CairoOption<CairoResult<BigNumberish, BigNumberish>>(
          CairoOptionVariant.Some,
          new CairoResult<BigNumberish, BigNumberish>(CairoResultVariant.Ok, 2000n)
        ),
      });
    });
  });

  describe('Cairo2.6.0 Sierra1.5.0', () => {
    test('declare Sierra 1.5.0', async () => {
      const declare260Response = await account.declare({
        contract: compiledC260,
        casm: compiledC260Casm,
      });
      expect(declare260Response.class_hash).toBe(
        '0x6184f1a71cad4bd123ff8bb3b97dc9ec876ced6489d9479cfdaada81a2f06d6'
      );
    });
  });
});
