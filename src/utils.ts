import {BigInt, BigDecimal, Address, Bytes, log} from '@graphprotocol/graph-ts'
import {
  User,
  Asset,
  PositionOrder,
  RebalanceOrder,
  LiquidityOrder,
  WithdrawalOrder,
  Funding,
  PositionTrade,
  LiquidityTrade,
  SubAccount,
  Price,
  FlashTake
} from '../generated/schema'

export let ZERO_BD = BigDecimal.fromString('0')
export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'
export let ZERO_BI = BigInt.fromI32(0)
export let ONE_BI = BigInt.fromI32(1)
export let BI_18 = BigInt.fromI32(18)
export let BI_5 = BigInt.fromI32(5)
export const POSITION_ORDER_TYPE = 1
export const LIQUIDITY_ORDER_TYPE = 2
export const WITHDRAW_ORDER_TYPE = 3
export const REBALANCE_ORDER_TYPE = 4

export function fetchAsset(id: string): Asset {
  let asset = Asset.load(id)
  if (asset === null) {
    log.debug("asset {} is empty", [id])
    asset = new Asset(id)
    asset.symbol = ""
    asset.decimal = ZERO_BI
    asset.isStable = false
    asset.tokenAddress = ADDRESS_ZERO
    asset.muxTokenAddress = ADDRESS_ZERO
    asset.timestamp = 0
    asset.save()
  }
  return asset as Asset
}

export function fetchUser(address: Address): User {
  let user = User.load(address.toHexString())
  if (user === null) {
    user = new User(address.toHexString())
    user.save()
  }
  return user as User
}

export function fetchPositionOrder(user: User, orderId: BigInt): PositionOrder {
  let orderIdString = orderId.toString()
  let positionOrder = PositionOrder.load(orderIdString)
  if (positionOrder === null) {
    positionOrder = new PositionOrder(orderIdString)
    positionOrder.user = user.id
    positionOrder.subAccountId = ""
    positionOrder.collateralId = 0
    positionOrder.assetId = 0
    positionOrder.profitTokenId = 0
    positionOrder.collateral = ZERO_BD
    positionOrder.size = ZERO_BD
    positionOrder.price = ZERO_BD
    positionOrder.flags = ZERO_BI
    positionOrder.isFinish = false
    positionOrder.isFilled = false
    positionOrder.isLong = true
    positionOrder.isOpen = true
    positionOrder.isMarket = false
    positionOrder.isTrigger = false
    positionOrder.createdAt = 0
    positionOrder.finishedAt = 0
    positionOrder.txHash = ""
    positionOrder.deadline = 0
    positionOrder.save()
  }
  return positionOrder as PositionOrder
}

export function fetchWithdrawOrder(user: User, orderId: BigInt): WithdrawalOrder {
  let orderIdString = orderId.toString()
  let withdrawalOrder = WithdrawalOrder.load(orderIdString)
  if (withdrawalOrder === null) {
    withdrawalOrder = new WithdrawalOrder(orderIdString)
    withdrawalOrder.user = user.id
    withdrawalOrder.subAccountId = ""
    withdrawalOrder.amount = ZERO_BD
    withdrawalOrder.collateralId = 0
    withdrawalOrder.assetId = 0
    withdrawalOrder.profitTokenId = 0
    withdrawalOrder.isLong = true
    withdrawalOrder.isProfit = false
    withdrawalOrder.isFinish = false
    withdrawalOrder.isFilled = false
    withdrawalOrder.createdAt = 0
    withdrawalOrder.finishedAt = 0
    withdrawalOrder.txHash = ""
    withdrawalOrder.save()
  }
  return withdrawalOrder as WithdrawalOrder
}

export function fetchLiquidityOrder(user: User, orderId: BigInt): LiquidityOrder {
  let orderIdString = orderId.toString()
  let liquidityOrder = LiquidityOrder.load(orderIdString)
  if (liquidityOrder === null) {
    liquidityOrder = new LiquidityOrder(orderIdString)
    liquidityOrder.user = user.id
    liquidityOrder.assetId = 0
    liquidityOrder.amount = ZERO_BD
    liquidityOrder.isAdding = false
    liquidityOrder.isFinish = false
    liquidityOrder.isFilled = false
    liquidityOrder.createdAt = 0
    liquidityOrder.finishedAt = 0
    liquidityOrder.txHash = ""
    liquidityOrder.save()
  }
  return liquidityOrder as LiquidityOrder
}

export function fetchRebalanceOrder(rebalancer: Address, orderId: BigInt): RebalanceOrder {
  let orderIdString = orderId.toString()
  let rebalanceOrder = RebalanceOrder.load(orderIdString)
  if (rebalanceOrder === null) {
    rebalanceOrder = new RebalanceOrder(orderIdString)
    rebalanceOrder.rebalancer = rebalancer.toString()
    rebalanceOrder.tokenId0 = 0
    rebalanceOrder.tokenId1 = 0
    rebalanceOrder.rawAmount0 = ZERO_BD
    rebalanceOrder.maxRawAmount1 = ZERO_BD
    rebalanceOrder.userData = ""
    rebalanceOrder.createAt = 0
    rebalanceOrder.finishedAt = 0
    rebalanceOrder.isFilled = false
    rebalanceOrder.isFinish = false
    rebalanceOrder.txHash = ""
    rebalanceOrder.save()
  }
  return rebalanceOrder as RebalanceOrder
}

export function handleFinishOrders(
  orderID: BigInt, isFilled: boolean, orderType: number, timestamp: i32,
): void {
  let orderId = orderID.toString()
  if (orderType == POSITION_ORDER_TYPE) {
    let order = PositionOrder.load(orderId)
    if (order === null) {
      log.error("order is empty {}, orderType {}", [orderId, orderType.toString()])
      return
    }
    order.isFinish = true
    order.isFilled = isFilled
    order.finishedAt = timestamp
    order.save()
  } else if (orderType == LIQUIDITY_ORDER_TYPE) {
    let order = LiquidityOrder.load(orderId)
    if (order === null) {
      log.error("order is empty {}, orderType {}", [orderId, orderType.toString()])
      return
    }
    order.isFinish = true
    order.isFilled = isFilled
    order.finishedAt = timestamp
    order.save()
  } else if (orderType == WITHDRAW_ORDER_TYPE) {
    let order = WithdrawalOrder.load(orderId)
    if (order === null) {
      log.error("order is empty {}, orderType {}", [orderId, orderType.toString()])
      return
    }
    order.isFinish = true
    order.isFilled = isFilled
    order.finishedAt = timestamp
    order.save()
  } else if (orderType == REBALANCE_ORDER_TYPE) {
    let order = RebalanceOrder.load(orderId)
    if (order === null) {
      log.error("order is empty {}, orderType {}", [orderId, orderType.toString()])
      return
    }
    order.isFinish = true
    order.isFilled = isFilled
    order.finishedAt = timestamp
    order.save()
  } else {
    log.error("order type is unknown {}, orderType {}", [orderId, orderType.toString()])
  }
}

export function fetchFunding(symbol: string, blockTime: i32): Funding {
  let timestamp = (blockTime / (60*60*8)) * (60*60*8)
  let id = symbol
    .concat("-")
    .concat(timestamp.toString())
  let funding = Funding.load(id)
  if (funding === null) {
    funding = new Funding(id)
    funding.timestamp = timestamp
    funding.createdAt = blockTime
    funding.symbol = symbol
    funding.longFundingRate = ZERO_BD
    funding.longCumulativeFundingRate = ZERO_BD
    funding.shortFundingRate = ZERO_BD
    funding.shortCumulativeFunding = ZERO_BD
    funding.save()
  }
  return funding as Funding
}

export function fetchPositionTrade(user: User, blockHash: string, logIndex: BigInt, txHash: string): PositionTrade {
  let id = blockHash
    .concat('-')
    .concat(logIndex.toString())
    .concat('-')
    .concat(user.id)
  let positionTrade = PositionTrade.load(id)
  if (positionTrade === null) {
    positionTrade = new PositionTrade(id)
    positionTrade.subAccountId = ""
    positionTrade.user = user.id
    positionTrade.collateralId = 0
    positionTrade.assetId = 0
    positionTrade.profitAssetId = 0
    positionTrade.amount = ZERO_BD
    positionTrade.isLong = false
    positionTrade.assetPrice = ZERO_BD
    positionTrade.collateralPrice = ZERO_BD
    positionTrade.profitAssetPrice = ZERO_BD
    positionTrade.feeUsd = ZERO_BD
    positionTrade.remainPosition = ZERO_BD
    positionTrade.remainCollateral = ZERO_BD
    positionTrade.createdAt = 0
    positionTrade.isOpen = false
    positionTrade.hasProfit = false
    positionTrade.pnlUsd = ZERO_BD
    positionTrade.isLiquidated = false
    positionTrade.txHash = txHash
    positionTrade.logIndex = logIndex
    positionTrade.flashTakeSequence = ZERO_BI
    positionTrade.save()
  } else {
    log.warning("positionTrade is exist {}", [id])
  }
  return positionTrade as PositionTrade
}

export function fetchFlashTake(sequence: BigInt): FlashTake {
  let id = sequence.toString()
  let flashTake = FlashTake.load(id)
  if (flashTake === null) {
    flashTake = new FlashTake(id)
    flashTake.subAccountId = ""
    flashTake.collateralId = 0
    flashTake.assetId = 0
    flashTake.profitAssetId = 0
    flashTake.size = ZERO_BD
    flashTake.collateral = ZERO_BD
    flashTake.gasFee = ZERO_BD
    flashTake.isLong = false
    flashTake.errorMessage = ""
    flashTake.createdAt = 0
    flashTake.isOpen = false
    flashTake.txHash = ""
    flashTake.blockHash = ""
    flashTake.logIndex = ZERO_BI
    flashTake.blockNumber = ZERO_BI
    flashTake.save()
  } else {
    log.warning("flashTake is exist {}", [id])
  }
  return flashTake as FlashTake
}

export function fetchLiquidityTrade(user: User, blockHash: string, logIndex: BigInt, txHash: string): LiquidityTrade {
  let id = blockHash
    .concat('-')
    .concat(logIndex.toString())
    .concat('-')
    .concat(user.id)
  let liquidityTrade = LiquidityTrade.load(id)
  if (liquidityTrade === null) {
    liquidityTrade = new LiquidityTrade(id)
    liquidityTrade.user = user.id
    liquidityTrade.tokenId = 0
    liquidityTrade.tokenPrice = ZERO_BD
    liquidityTrade.mlpPrice = ZERO_BD
    liquidityTrade.mlpAmount = ZERO_BD
    liquidityTrade.fee = ZERO_BD
    liquidityTrade.isAdd = false
    liquidityTrade.createdAt = 0
    liquidityTrade.txHash = txHash
    liquidityTrade.logIndex = logIndex
    liquidityTrade.save()
  } else {
    log.warning("liquidityTrade is exist {}", [id])
  }
  return liquidityTrade as LiquidityTrade
}

export function fetchSubAccount(user: User, subAccountID: string, timestamp: BigInt): SubAccount {
  let subAccount = SubAccount.load(subAccountID)
  if (subAccount === null) {
    subAccount = new SubAccount(subAccountID)
    subAccount.user = user.id
    subAccount.collateralId = 0
    subAccount.assetId = 0
    subAccount.size = ZERO_BD
    subAccount.isLong = false
    subAccount.createdAt = timestamp.toI32()
    subAccount.save()
  } else {
    log.warning("SubAccount is exist {}", [subAccountID])
  }
  return subAccount as SubAccount
}

export function fetchPrice(assetId: i32, blockNumber: BigInt, timestamp: BigInt): Price {
  let id = assetId.toString()
    .concat('-')
    .concat(blockNumber.toString())
  let price = Price.load(id)
  if (price === null) {
    price = new Price(id)
    price.assetId = assetId
    price.price = ZERO_BD
    price.referencePrice = ZERO_BD
    price.deviation = ZERO_BI
    price.createdAt = timestamp.toI32()
    price.save()
  } else {
    log.warning("Price is exist {}", [id])
  }
  return price as Price
}

export class SubAccountStruct {
  account: string
  collateralId: number
  assetId: number
  isLong: boolean
}

export function decodeSubAccountId(subAccountId: Bytes): SubAccountStruct {
  return {
    account: subAccountId.toHexString().slice(0, 42),
    collateralId: parseInt(subAccountId.toHexString().slice(42, 44), 16),
    assetId: parseInt(subAccountId.toHexString().slice(44,46), 16),
    isLong: BigDecimal.fromString(subAccountId.toHexString().slice(46,48)).gt(ZERO_BD)
  }
}

export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = BigDecimal.fromString('1')
  for (let i = ZERO_BI; i.lt(decimals as BigInt); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString('10'))
  }
  return bd
}

export function convertToDecimal(amount: BigInt, decimals: BigInt): BigDecimal {
  if (decimals == ZERO_BI) {
    return amount.toBigDecimal()
  }
  return amount.toBigDecimal().div(exponentToBigDecimal(decimals))
}
