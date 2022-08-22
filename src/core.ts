import {
  CancelOrder as CancelOrderEvent,
  FillOrder as FillOrderEvent,
  NewLiquidityOrder as NewLiquidityOrderEvent,
  NewPositionOrder as NewPositionOrderEvent,
  NewPositionOrder1 as NewPositionOrderEventOld,
  NewRebalanceOrder as NewRebalanceOrderEvent,
  NewWithdrawalOrder as NewWithdrawalOrderEvent,
  FillingFlashTake as FillingFlashTakeEvent,
  FillFlashTake as FillFlashTakeEvent,
} from '../generated/OrderBook/OrderBook'

import {
  ClosePosition1 as ClosePositionEventOld,
  OpenPosition1 as OpenPositionEventOld,
  ClosePosition as ClosePositionEvent,
  OpenPosition as OpenPositionEvent,
  UpdateFundingRate as UpdateFundingRateEvent,
  AddAsset as AddAssetEvent,
  AddLiquidity as AddLiquidityEvent,
  RemoveLiquidity as RemoveLiquidityEvent,
  Liquidate as LiquidateEvent,
  Liquidate1 as LiquidateEventOld,
  SetAssetSymbol as SetAssetSymbolEvent,
} from "../generated/LiquidityPool/LiquidityPool";

import {
  AssetPriceOutOfRange as AssetPriceOutOfRangeEvent,
} from "../generated/LibReferenceOracle/LibReferenceOracle"

import {log, Address, BigInt, Bytes, store} from '@graphprotocol/graph-ts'

import {
  convertToDecimal,
  fetchAsset,
  fetchPositionOrder,
  fetchUser,
  BI_18, BI_5,
  fetchLiquidityOrder,
  handleFinishOrders,
  fetchWithdrawOrder,
  decodeSubAccountId,
  fetchFunding,
  fetchPositionTrade,
  fetchLiquidityTrade,
  fetchSubAccount,
  fetchPrice,
  fetchRebalanceOrder, ZERO_BI, fetchFlashTake,
} from "./utils";
import {  Asset, FlashTakeSequence, PositionTrade } from "../generated/schema";

function handlePositionOrderEvent(
  subAccountId: Bytes, orderId: BigInt, collateral: BigInt, profitTokenId: i32, size: BigInt,
  price: BigInt, flags: i32, timestamp: i32, txHash: string, deadline: BigInt,
  ): void {
  // decode
  let subAccount = decodeSubAccountId(subAccountId)
  let account = subAccount.account
  let collateralId = <i32>subAccount.collateralId
  let assetId = <i32>subAccount.assetId
  let isLong = subAccount.isLong

  // fetch user
  let user = fetchUser(Address.fromString(account))
  // fetch position
  let positionOrder = fetchPositionOrder(user, orderId)
  // fetch collateral config
  let config = fetchAsset(collateralId.toString())
  let newCollateral = convertToDecimal(collateral, config.decimal)
  positionOrder.subAccountId = subAccountId.toHexString()
  positionOrder.collateralId = collateralId
  positionOrder.assetId = assetId
  positionOrder.profitTokenId = profitTokenId
  positionOrder.collateral = newCollateral
  positionOrder.size = convertToDecimal(size, BI_18)
  positionOrder.price = convertToDecimal(price, BI_18)

  let flagsBigInt = BigInt.fromI32(flags)
  positionOrder.flags = flagsBigInt

  // 128 = 0x80 = 2**7
  let isOpenBigInt = BigInt.fromString("128")
  positionOrder.isOpen = isOpenBigInt.bitAnd(flagsBigInt).equals(isOpenBigInt);
  // 64 = 0x40 = 2**6
  let isMarketBigInt = BigInt.fromString("64")
  positionOrder.isMarket = isMarketBigInt.bitAnd(flagsBigInt).equals(isMarketBigInt);
  // 16 = 0x10 = 2**4
  let isTriggerBigInt = BigInt.fromString("16")
  positionOrder.isTrigger = isTriggerBigInt.bitAnd(flagsBigInt).equals(isTriggerBigInt);
  positionOrder.isFinish = false
  positionOrder.isFilled = false
  positionOrder.isLong = isLong
  positionOrder.createdAt = timestamp
  positionOrder.txHash = txHash
  positionOrder.deadline = deadline.toI32()
  positionOrder.save()
}

export function handlePositionOrderOld(event: NewPositionOrderEventOld): void {
  handlePositionOrderEvent(event.params.subAccountId, event.params.orderId, event.params.collateral,
    event.params.profitTokenId, event.params.size, event.params.price, event.params.flags,
    event.block.timestamp.toI32(), event.block.hash.toHexString(), ZERO_BI,
  )
}

export function handlePositionOrder(event: NewPositionOrderEvent): void {
  handlePositionOrderEvent(event.params.subAccountId, event.params.orderId, event.params.collateral,
    event.params.profitTokenId, event.params.size, event.params.price, event.params.flags,
    event.block.timestamp.toI32(), event.block.hash.toHexString(), event.params.deadline,
  )
}

export function handleWithdrawOrder(event: NewWithdrawalOrderEvent): void {
  log.debug("handleWithdrawOrder subAccountId {}, orderId {}", [
    event.params.subAccountId.toHexString(), event.params.orderId.toString(),
  ])
  let subAccountId = event.params.subAccountId
  let subAccount = decodeSubAccountId(subAccountId)
  let account = subAccount.account
  let collateralId = <i32>subAccount.collateralId
  let assetId = <i32>subAccount.assetId
  let isLong = subAccount.isLong

  log.debug("withdrawOrder subAccountId toHexString {}, account {}, collateralId {}, assetId {}, isLong {}", [
    subAccountId.toHexString(), account, collateralId.toString(), assetId.toString(), isLong.toString(),
  ])
  log.debug("withdrawOrder orderId {} profitTokenId {} isProfit {}", [
    event.params.orderId.toString(), event.params.profitTokenId.toString(), event.params.isProfit.toString(),
  ])

  // fetch user
  let user = fetchUser(Address.fromString(account))
  // fetch withdrawOrder
  let withdrawOrder = fetchWithdrawOrder(user, event.params.orderId)

  // handle amount decimal
  let isProfit = event.params.isProfit
  let profitTokenId = event.params.profitTokenId
  let config: Asset
  if (isProfit) {
    // withdrawProfit
    if (isLong) {
      // long take asset
      config = fetchAsset(assetId.toString())
    } else {
      // short take profit
      // config = fetchAsset(parseInt(profitTokenId.toString(), 10).toString())
      config = fetchAsset(profitTokenId.toString())
    }
  } else {
    // withdrawCollateral
    config = fetchAsset(collateralId.toString())
  }
  log.debug("config id {}, config symbol {}, config.decimal {}", [
    config.id, config.symbol, config.decimal.toString(),
  ])
  let newAmount = convertToDecimal(event.params.rawAmount, config.decimal)

  withdrawOrder.subAccountId = subAccountId.toHexString()
  withdrawOrder.amount = newAmount
  withdrawOrder.collateralId = collateralId
  withdrawOrder.assetId = assetId
  withdrawOrder.profitTokenId = profitTokenId
  withdrawOrder.isLong = isLong
  withdrawOrder.isProfit = isProfit
  withdrawOrder.isFinish = false
  withdrawOrder.isFilled = false
  withdrawOrder.createdAt = event.block.timestamp.toI32()
  withdrawOrder.txHash = event.transaction.hash.toHexString()
  withdrawOrder.save()
}

export function handleLiquidityOrder(event: NewLiquidityOrderEvent): void {
  log.debug("handleLiquidityOrder orderId {}, account {}", [
    event.params.orderId.toString(), event.params.account.toHexString(),
  ])
  let account = event.params.account
  let orderId = event.params.orderId
  // fetch user
  let user = fetchUser(account)
  // fetch liquidity
  let liquidityOrder = fetchLiquidityOrder(user, orderId)
  let assetId = event.params.assetId
  let isAdding = event.params.isAdding

  let decimal: BigInt
  if (isAdding) {
    let config = fetchAsset(assetId.toString())
    decimal = config.decimal
  } else {
    decimal = BI_18
  }

  liquidityOrder.assetId = assetId
  liquidityOrder.amount = convertToDecimal(event.params.rawAmount, decimal)
  liquidityOrder.isAdding = isAdding
  liquidityOrder.isFinish = false
  liquidityOrder.isFilled = false
  liquidityOrder.createdAt = event.block.timestamp.toI32()
  liquidityOrder.txHash = event.transaction.hash.toHexString()
  liquidityOrder.save()
}

export function handleRebalanceOrder(event: NewRebalanceOrderEvent): void {
  let rebalanceOrder = fetchRebalanceOrder(event.params.rebalancer, event.params.orderId)
  rebalanceOrder.tokenId0 = event.params.tokenId0
  rebalanceOrder.tokenId1 = event.params.tokenId1
  rebalanceOrder.rawAmount0 = convertToDecimal(event.params.rawAmount0, BI_18)
  rebalanceOrder.maxRawAmount1 = convertToDecimal(event.params.maxRawAmount1, BI_18)
  rebalanceOrder.userData = event.params.userData.toString()
  rebalanceOrder.createAt = event.block.timestamp.toI32()
  rebalanceOrder.txHash = event.transaction.hash.toHexString()
  rebalanceOrder.save()
}

export function handleCancelOrder(event: CancelOrderEvent): void {
  log.debug("handleCancelOrder orderId {}, orderType {}", [
    event.params.orderId.toString(), event.params.orderType.toString(),
  ])
  handleFinishOrders(event.params.orderId, false, event.params.orderType, event.block.timestamp.toI32())
}

export function handleFillOrder(event: FillOrderEvent): void {
  log.debug("handleFillOrder orderId {}, orderType {}", [
    event.params.orderId.toString(), event.params.orderType.toString(),
  ])
  handleFinishOrders(event.params.orderId, true, event.params.orderType, event.block.timestamp.toI32())
}

export function handleAddAsset(event: AddAssetEvent): void {
  let id = event.params.id.toString()
  let asset = fetchAsset(id)
  asset.symbol = event.params.symbol.toString()
  asset.decimal = BigInt.fromI32(event.params.decimals)
  asset.isStable = event.params.isStable
  asset.tokenAddress = event.params.tokenAddress.toHexString()
  asset.muxTokenAddress = event.params.muxTokenAddress.toHexString()
  asset.timestamp = event.block.timestamp.toI32()
  asset.save()
  log.debug("handleAddAsset id {}, symbol {}, decimal {}, isStable {}", [id, asset.symbol, asset.decimal.toString(), asset.isStable.toString()])
}

export function handleSetAssetSymbol(event: SetAssetSymbolEvent): void {
  let id = event.params.assetId.toString()
  let asset = fetchAsset(id)
  let targetSymbol = event.params.symbol.toString()
  asset.symbol = targetSymbol
  asset.save()
  log.debug("handleSetAssetSymbol id {}, symbol {}", [id, targetSymbol])
}

export function handleUpdateFundingRate(event: UpdateFundingRateEvent): void {
  log.debug("handleUpdateFundingRate, tokenId {}, longFundingRate {}, shortFundingRate {}, timestamp {}", [
    event.params.tokenId.toString(), event.params.longFundingRate.toString(), event.params.shortFundingRate.toString(),
    event.block.timestamp.toI32().toString(),
  ])
  let blockTime = event.block.timestamp.toI32()

  let asset = fetchAsset(event.params.tokenId.toString())
  log.debug("handleUpdateFundingRate tokenId {} asset.symbol {}", [
    event.params.tokenId.toString(), asset.symbol,
  ])
  let funding = fetchFunding(asset.symbol, blockTime)
  funding.longFundingRate = convertToDecimal(event.params.longFundingRate, BI_5)
  funding.longCumulativeFundingRate = convertToDecimal(event.params.longCumulativeFundingRate, BI_18)
  funding.shortFundingRate = convertToDecimal(event.params.shortFundingRate, BI_5)
  funding.shortCumulativeFunding = convertToDecimal(event.params.shortCumulativeFunding, BI_18)
  funding.save()
}

export function handleAddLiquidityTrade(event: AddLiquidityEvent): void {
  let trader = event.params.trader
  log.info("handleAddLiquidityTrade trader {}, tokenId {}, tokenPrice {}, mlpPrice {}, mlpAmount {}", [
    trader.toHexString(), event.params.tokenId.toString(), event.params.tokenPrice.toString(),
    event.params.mlpPrice.toString(), event.params.mlpAmount.toString(),
  ])

  let user = fetchUser(trader)
  let liquidityTrade = fetchLiquidityTrade(user, event.block.hash.toHexString(), event.logIndex, event.transaction.hash.toHexString())
  liquidityTrade.createdAt = event.block.timestamp.toI32()
  let tokenId = event.params.tokenId
  liquidityTrade.tokenId = tokenId
  // handle token decimal
  let tokenAsset = fetchAsset(tokenId.toString())
  liquidityTrade.tokenPrice = convertToDecimal(event.params.tokenPrice, tokenAsset.decimal)

  liquidityTrade.mlpPrice = convertToDecimal(event.params.mlpPrice, BI_18)
  liquidityTrade.mlpAmount = convertToDecimal(event.params.mlpAmount, BI_18)
  liquidityTrade.fee = convertToDecimal(event.params.fee, BI_18)
  liquidityTrade.isAdd = true
  liquidityTrade.blockNumber = event.block.number
  liquidityTrade.save()
}

export function handleRemoveLiquidityTrade(event: RemoveLiquidityEvent): void {
  let trader = event.params.trader
  log.info("handleRemoveLiquidityTrade trader {}, tokenId {}, tokenPrice {}, mlpPrice {}, mlpAmount {}", [
    trader.toHexString(), event.params.tokenId.toString(), event.params.tokenPrice.toString(),
    event.params.mlpPrice.toString(), event.params.mlpAmount.toString(),
  ])

  let user = fetchUser(trader)
  let liquidityTrade = fetchLiquidityTrade(user, event.block.hash.toHexString(), event.logIndex, event.transaction.hash.toHexString())
  liquidityTrade.createdAt = event.block.timestamp.toI32()
  let tokenId = event.params.tokenId
  liquidityTrade.tokenId = tokenId
  // handle token decimal
  let tokenAsset = fetchAsset(tokenId.toString())
  liquidityTrade.tokenPrice = convertToDecimal(event.params.tokenPrice, tokenAsset.decimal)

  liquidityTrade.mlpPrice = convertToDecimal(event.params.mlpPrice, BI_18)
  liquidityTrade.mlpAmount = convertToDecimal(event.params.mlpAmount, BI_18)
  liquidityTrade.fee = convertToDecimal(event.params.fee, BI_18)
  liquidityTrade.isAdd = false
  liquidityTrade.blockNumber = event.block.number
  liquidityTrade.save()
}

export function handleOpenPositionTradeOld(event: OpenPositionEventOld): void {
  let subAccountId = event.params.args.subAccountId
  log.debug("handleOpenPositionTradeOld subAccountID {}, amount {}, fee {}", [
    subAccountId.toHexString(), event.params.args.amount.toString(),
    event.params.args.feeUsd.toString()
  ])
  let user = fetchUser(event.params.trader)
  let positionTrade = fetchPositionTrade(user, event.block.hash.toHexString(), event.logIndex, event.transaction.hash.toHexString())
  positionTrade.subAccountId = event.params.args.subAccountId.toHexString()
  positionTrade.createdAt = event.block.timestamp.toI32()
  positionTrade.collateralId = event.params.args.collateralId
  positionTrade.assetId = event.params.assetId
  let amount = convertToDecimal(event.params.args.amount, BI_18)
  positionTrade.amount = amount
  positionTrade.isLong = event.params.args.isLong
  positionTrade.feeUsd = convertToDecimal(event.params.args.feeUsd, BI_18)
  positionTrade.assetPrice = convertToDecimal(event.params.args.assetPrice, BI_18)
  positionTrade.collateralPrice = convertToDecimal(event.params.args.collateralPrice, BI_18)
  positionTrade.isOpen = true
  positionTrade.blockNumber = event.block.number
  positionTrade.save()

  let subAccount = fetchSubAccount(user, subAccountId.toHexString(), event.block.timestamp)
  subAccount.size = subAccount.size.plus(amount)
  subAccount.collateralId = event.params.args.collateralId
  subAccount.assetId = event.params.assetId
  subAccount.isLong = event.params.args.isLong
  subAccount.save()
}

export function handleOpenPositionTrade(event: OpenPositionEvent): void {
  let subAccountId = event.params.args.subAccountId
  log.debug("handleOpenPositionTrade subAccountID {}, amount {}, fee {}, remainingCollateral {}", [
    subAccountId.toHexString(), event.params.args.amount.toString(),
    event.params.args.feeUsd.toString(), event.params.args.remainCollateral.toString(),
  ])
  let user = fetchUser(event.params.trader)
  let positionTrade = fetchPositionTrade(user, event.block.hash.toHexString(), event.logIndex, event.transaction.hash.toHexString())
  positionTrade.subAccountId = event.params.args.subAccountId.toHexString()
  positionTrade.createdAt = event.block.timestamp.toI32()
  positionTrade.collateralId = event.params.args.collateralId
  positionTrade.assetId = event.params.assetId
  let amount = convertToDecimal(event.params.args.amount, BI_18)
  positionTrade.amount = amount
  positionTrade.isLong = event.params.args.isLong
  positionTrade.feeUsd = convertToDecimal(event.params.args.feeUsd, BI_18)
  positionTrade.assetPrice = convertToDecimal(event.params.args.assetPrice, BI_18)
  positionTrade.collateralPrice = convertToDecimal(event.params.args.collateralPrice, BI_18)
  positionTrade.remainPosition = convertToDecimal(event.params.args.remainPosition, BI_18)
  positionTrade.remainCollateral = convertToDecimal(event.params.args.remainCollateral, BI_18)
  positionTrade.isOpen = true
  positionTrade.blockNumber = event.block.number

  //relate with flash take sequence
  let flashTakeSequence = FlashTakeSequence.load(event.transaction.hash.toHexString())
  if (flashTakeSequence !== null) {
    positionTrade.flashTakeSequence = flashTakeSequence.sequence
    flashTakeSequence.positionTradeId = positionTrade.id
    flashTakeSequence.save()
  }
  positionTrade.save()

  let subAccount = fetchSubAccount(user, subAccountId.toHexString(), event.block.timestamp)
  subAccount.size = subAccount.size.plus(amount)
  subAccount.collateralId = event.params.args.collateralId
  subAccount.assetId = event.params.assetId
  subAccount.isLong = event.params.args.isLong
  subAccount.marginUsed = convertToDecimal(event.params.args.remainCollateral, BI_18)
  subAccount.save()
}

export function handleClosePositionTrade(event: ClosePositionEvent): void {
  let subAccountId = event.params.args.subAccountId
  log.debug("handleClosePositionTrade subAccountID {}, fee {}", [
    subAccountId.toHexString(), event.params.args.feeUsd.toString()
  ])
  let user = fetchUser(event.params.trader)
  let positionTrade = fetchPositionTrade(user, event.block.hash.toHexString(), event.logIndex, event.transaction.hash.toHexString())
  positionTrade.subAccountId = event.params.args.subAccountId.toHexString()
  positionTrade.createdAt = event.block.timestamp.toI32()
  positionTrade.collateralId = event.params.args.collateralId
  positionTrade.assetId = event.params.assetId
  positionTrade.profitAssetId = event.params.args.profitAssetId
  positionTrade.amount = convertToDecimal(event.params.args.amount, BI_18)
  positionTrade.isLong = event.params.args.isLong
  positionTrade.feeUsd = convertToDecimal(event.params.args.feeUsd, BI_18)
  positionTrade.assetPrice = convertToDecimal(event.params.args.assetPrice, BI_18)
  positionTrade.collateralPrice = convertToDecimal(event.params.args.collateralPrice, BI_18)
  positionTrade.profitAssetPrice = convertToDecimal(event.params.args.profitAssetPrice, BI_18)
  positionTrade.remainCollateral = convertToDecimal(event.params.args.remainCollateral, BI_18)
  positionTrade.remainPosition = convertToDecimal(event.params.args.remainPosition, BI_18)
  positionTrade.isOpen = false
  positionTrade.pnlUsd = convertToDecimal(event.params.args.pnlUsd, BI_18)
  positionTrade.hasProfit = event.params.args.hasProfit
  positionTrade.blockNumber = event.block.number
  //relate with flash take sequence
  let flashTakeSequence = FlashTakeSequence.load(event.transaction.hash.toHexString())
  if (flashTakeSequence !== null) {
    positionTrade.flashTakeSequence = flashTakeSequence.sequence
    flashTakeSequence.positionTradeId = positionTrade.id
    flashTakeSequence.save()
  }
  positionTrade.save()

  let subAccount = fetchSubAccount(user, subAccountId.toHexString(), event.block.timestamp)
  subAccount.size = subAccount.size.minus(positionTrade.amount)
  subAccount.collateralId = event.params.args.collateralId
  subAccount.assetId = event.params.assetId
  subAccount.marginUsed = convertToDecimal(event.params.args.remainCollateral, BI_18)
  subAccount.isLong = event.params.args.isLong
  subAccount.save()
}

export function handleClosePositionTradeOld(event: ClosePositionEventOld): void {
  let subAccountId = event.params.args.subAccountId
  log.debug("handleClosePositionTradeOld subAccountID {}, fee {}", [
    subAccountId.toHexString(), event.params.args.feeUsd.toString()
  ])
  let user = fetchUser(event.params.trader)
  let positionTrade = fetchPositionTrade(user, event.block.hash.toHexString(), event.logIndex, event.transaction.hash.toHexString())
  positionTrade.subAccountId = event.params.args.subAccountId.toHexString()
  positionTrade.createdAt = event.block.timestamp.toI32()
  positionTrade.collateralId = event.params.args.collateralId
  positionTrade.assetId = event.params.assetId
  positionTrade.profitAssetId = event.params.args.profitAssetId
  positionTrade.amount = convertToDecimal(event.params.args.amount, BI_18)
  positionTrade.isLong = event.params.args.isLong
  positionTrade.feeUsd = convertToDecimal(event.params.args.feeUsd, BI_18)
  positionTrade.assetPrice = convertToDecimal(event.params.args.assetPrice, BI_18)
  positionTrade.collateralPrice = convertToDecimal(event.params.args.collateralPrice, BI_18)
  positionTrade.profitAssetPrice = convertToDecimal(event.params.args.profitAssetPrice, BI_18)
  positionTrade.isOpen = false
  positionTrade.pnlUsd = convertToDecimal(event.params.args.pnlUsd, BI_18)
  positionTrade.hasProfit = event.params.args.hasProfit
  positionTrade.blockNumber = event.block.number
  positionTrade.save()

  let subAccount = fetchSubAccount(user, subAccountId.toHexString(), event.block.timestamp)
  subAccount.size = subAccount.size.minus(positionTrade.amount)
  subAccount.collateralId = event.params.args.collateralId
  subAccount.assetId = event.params.assetId
  subAccount.isLong = event.params.args.isLong
  subAccount.save()
}

export function handleLiquidate(event: LiquidateEvent): void {
  let subAccountId = event.params.args.subAccountId
  log.debug("handleLiquidate subAccountID {}, fee {}", [
    subAccountId.toHexString(), event.params.args.feeUsd.toString()
  ])
  let user = fetchUser(event.params.trader)

  let positionTrade = fetchPositionTrade(user, event.block.hash.toHexString(), event.logIndex, event.transaction.hash.toHexString())
  positionTrade.subAccountId = event.params.args.subAccountId.toHexString()
  positionTrade.createdAt = event.block.timestamp.toI32()
  positionTrade.collateralId = event.params.args.collateralId
  positionTrade.assetId = event.params.assetId
  positionTrade.profitAssetId = event.params.args.profitAssetId
  let amount = convertToDecimal(event.params.args.amount, BI_18)
  positionTrade.amount = amount
  positionTrade.isLong = event.params.args.isLong
  positionTrade.feeUsd = convertToDecimal(event.params.args.feeUsd, BI_18)
  positionTrade.assetPrice = convertToDecimal(event.params.args.assetPrice, BI_18)
  positionTrade.collateralPrice = convertToDecimal(event.params.args.collateralPrice, BI_18)
  positionTrade.profitAssetPrice = convertToDecimal(event.params.args.profitAssetPrice, BI_18)
  positionTrade.isOpen = false
  positionTrade.pnlUsd = convertToDecimal(event.params.args.pnlUsd, BI_18)
  positionTrade.hasProfit = event.params.args.hasProfit
  positionTrade.isLiquidated = true
  positionTrade.remainCollateral = convertToDecimal(event.params.args.remainCollateral, BI_18)
  positionTrade.blockNumber = event.block.number
  positionTrade.save()

  let subAccount = fetchSubAccount(user, subAccountId.toHexString(), event.block.timestamp)
  subAccount.size = subAccount.size.minus(amount)
  subAccount.collateralId = event.params.args.collateralId
  subAccount.assetId = event.params.assetId
  subAccount.marginUsed = convertToDecimal(event.params.args.remainCollateral, BI_18)
  subAccount.isLong = event.params.args.isLong
  subAccount.save()
}

export function handleLiquidateOld(event: LiquidateEventOld): void {
  let subAccountId = event.params.args.subAccountId
  log.debug("handleLiquidateOld subAccountID {}, fee {}", [
    subAccountId.toHexString(), event.params.args.feeUsd.toString()
  ])
  let user = fetchUser(event.params.trader)

  let positionTrade = fetchPositionTrade(user, event.block.hash.toHexString(), event.logIndex, event.transaction.hash.toHexString())
  positionTrade.subAccountId = event.params.args.subAccountId.toHexString()
  positionTrade.createdAt = event.block.timestamp.toI32()
  positionTrade.collateralId = event.params.args.collateralId
  positionTrade.assetId = event.params.assetId
  positionTrade.profitAssetId = event.params.args.profitAssetId
  let amount = convertToDecimal(event.params.args.amount, BI_18)
  positionTrade.amount = amount
  positionTrade.isLong = event.params.args.isLong
  positionTrade.feeUsd = convertToDecimal(event.params.args.feeUsd, BI_18)
  positionTrade.assetPrice = convertToDecimal(event.params.args.assetPrice, BI_18)
  positionTrade.collateralPrice = convertToDecimal(event.params.args.collateralPrice, BI_18)
  positionTrade.profitAssetPrice = convertToDecimal(event.params.args.profitAssetPrice, BI_18)
  positionTrade.isOpen = false
  positionTrade.pnlUsd = convertToDecimal(event.params.args.pnlUsd, BI_18)
  positionTrade.hasProfit = event.params.args.hasProfit
  positionTrade.isLiquidated = true
  positionTrade.blockNumber = event.block.number
  positionTrade.save()

  let subAccount = fetchSubAccount(user, subAccountId.toHexString(), event.block.timestamp)
  subAccount.size = subAccount.size.minus(amount)
  subAccount.collateralId = event.params.args.collateralId
  subAccount.assetId = event.params.assetId
  subAccount.isLong = event.params.args.isLong
  subAccount.save()
}

export function handlePrice(event: AssetPriceOutOfRangeEvent): void {
  log.warning("handlePrice assetId {}, price {}, referencePrice {}, deviation {}", [
    event.params.assetId.toString(), event.params.price.toString(), event.params.referencePrice.toString(),
    event.params.deviation.toString(),
  ])

  let price = fetchPrice(event.params.assetId, event.block.number, event.block.timestamp)
  price.price = convertToDecimal(event.params.price, BI_18)
  price.referencePrice = convertToDecimal(event.params.referencePrice, BI_18)
  price.deviation = event.params.deviation
  price.save()
}

export function handleFillingFlashTake(event: FillingFlashTakeEvent): void {
  let flashTakeSequence = new FlashTakeSequence(event.transaction.hash.toHexString())
  flashTakeSequence.sequence = event.params.flashTakeSequence
  flashTakeSequence.save()
}

export function handleFillFlashTake(event: FillFlashTakeEvent): void {
  let subAccount = decodeSubAccountId(event.params.subAccountId)
  let user = fetchUser(Address.fromString(subAccount.account))
  let flashTake = fetchFlashTake(event.params.flashTakeSequence)
  flashTake.subAccountId = event.params.subAccountId.toHexString()
  flashTake.user = user.id
  flashTake.collateralId = <i32>subAccount.collateralId
  flashTake.assetId = <i32>subAccount.assetId
  flashTake.profitAssetId = event.params.profitTokenId
  flashTake.size = convertToDecimal(event.params.size, BI_18)
  let tokenAsset = fetchAsset(subAccount.collateralId.toString())
  flashTake.collateral = convertToDecimal(event.params.collateral, tokenAsset.decimal)
  flashTake.gasFee = convertToDecimal(event.params.gasFee, tokenAsset.decimal)
  flashTake.isLong = subAccount.isLong
  flashTake.errorMessage = event.params.errorMessage
  // 128 = 0x80 = 2**7
  let isOpenBigInt = BigInt.fromString("128")
  flashTake.isOpen = isOpenBigInt.bitAnd(BigInt.fromI32(event.params.flags)).equals(isOpenBigInt)
  flashTake.createdAt = event.block.timestamp.toI32()
  flashTake.txHash = event.transaction.hash.toHexString()
  flashTake.logIndex = event.transaction.index
  flashTake.blockNumber = event.block.number
  flashTake.blockHash = event.block.hash.toHexString()
  let flashTakeSequence = FlashTakeSequence.load(event.transaction.hash.toHexString())
  if (flashTakeSequence !== null) {
    if (flashTakeSequence.positionTradeId !== null) {
      let id = flashTakeSequence.positionTradeId!
      let positionTrade = PositionTrade.load(id)
      if (positionTrade !== null) {
        flashTake.positionTrade = positionTrade.id
      }
    }
    store.remove('FlashTakeSequence', event.transaction.hash.toHexString())
  }
  flashTake.save()
}