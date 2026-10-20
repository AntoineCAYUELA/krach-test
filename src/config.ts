// Tous les paramètres chiffrés du jeu, repris du GDD (docs/gdd.md).
// Règle : aucun nombre de règle ailleurs dans le code. Pour équilibrer, on modifie ce fichier.

export const CONFIG = {
  /** GDD 2.1, 4, 7.1, 8 */
  run: {
    startingCapital: 1000,
    startingPrimes: 4,
    seanceCount: 8,
    /** Quotas de Performance par séance (GDD 7.1). */
    quotas: [20, 25, 50, 80, 130, 200, 300, 450],
    /** Index (0 = séance 1) des séances à événement tirées au hasard (GDD 7.2). */
    randomEventSeances: [1, 3, 5],
    /** Index de la séance finale, toujours le Krach. */
    finalEventSeance: 7,
    minStake: 10,
    toolSlots: 5,
    consumableSlots: 2,
  },

  /** GDD 2.2, 2.3 */
  seance: {
    orders: 5,
    discards: 3,
    candles: 24,
    handSize: 5,
    maxPlayedCards: 3,
    historyCandles: 40,
    tradeDuration: 3,
    scalpDuration: 1,
  },

  /** GDD 4 : Primes en fin de séance réussie */
  rewards: {
    normalSeance: 3,
    eventSeance: 5,
    perUnusedOrder: 1,
    interestStep: 250,
    interestMax: 4,
  },

  /** GDD 2.4 : génération des prix */
  market: {
    ticksPerCandle: 10,
    regimeWeights: { bull: 0.3, bear: 0.3, range: 0.4 },
    regimeSwitchProb: 0.04,
    drift: 0.003,
    meanReversion: 0.3,
    newsProb: 0.04,
    newsGapMin: 0.03,
    newsGapMax: 0.06,
    newsSentimentReliability: 0.7,
    newsVolumeMultiplier: 3,
    volumeMoveFactor: 2,
    volumeNoiseSigma: 0.3,
    /** Bougies générées à l'avance (Calendrier économique, Boule de cristal). */
    lookahead: 2,
  },

  /** GDD 2.4 : les 3 actions fictives */
  stocks: [
    { ticker: 'LGE', name: 'Lugdunum Énergie', profile: 'Défensive', sigma: 0.012, baseVolume: 10000, startPrice: 42 },
    { ticker: 'NXC', name: 'Nexacorp', profile: 'Standard', sigma: 0.015, baseVolume: 10000, startPrice: 50 },
    { ticker: 'RHR', name: 'Rhône Robotics', profile: 'Tech volatile', sigma: 0.02, baseVolume: 10000, startPrice: 120 },
  ],

  /** GDD 2.5 */
  indicators: {
    smaShort: 5,
    smaLong: 20,
    rsiPeriod: 14,
    levelWindow: 20,
    volumeWindow: 20,
    trendLookback: 5,
    crossLookback: 3,
  },

  /** GDD 2.6 : conditions des cartes Signal */
  cards: {
    rsiOversold: 30,
    rsiOverbought: 70,
    wickBodyRatio: 2,
    levelTolerance: 0.01,
    volumeSpikeRatio: 2,
    volumeConfirmRatio: 1.3,
    volumeConfirmCandles: 3,
  },

  /** GDD 5.1 : coûts de transaction */
  costs: {
    spread: 0.002,
    feePerSide: 0.001,
  },

  /** GDD 2.3, 5.2 */
  trade: {
    stakeStep: 0.1,
    baseLeverages: [1, 2],
    toolLeverages: [1, 2, 3, 4, 5],
    /** Liquidation quand la perte latente atteint 80 % de la mise. */
    liquidationThreshold: 0.8,
  },

  /** GDD 5.1 */
  scoring: {
    analysisPointsPerCard: 5,
    lossFactor: 0.5,
    setupMulti: {
      feeling: 1,
      single: 1.5,
      double: 2,
      confluence: 2.5,
      triple: 3,
      totalConfluence: 4,
    },
  },

  /** GDD 6 : prix, rareté et paramètres des 15 Outils */
  tools: {
    stopLoss: { price: 4, rarity: 'common', stopPct: 0.05, primesPerStop: 1 },
    takeProfit: { price: 4, rarity: 'common', takePct: 0.04, multiBonus: 1 },
    lowCostBroker: { price: 3, rarity: 'common', feePerSide: 0.0004 },
    marketMaker: { price: 3, rarity: 'common', spread: 0.0008 },
    candleReader: { price: 4, rarity: 'common', multiPerCard: 1 },
    rsiOscillator: { price: 4, rarity: 'common', oversold: 35, overbought: 65 },
    calendar: { price: 4, rarity: 'common', warningCandles: 2 },
    chartist: { price: 6, rarity: 'uncommon', multiPerCard: 1.5 },
    leverage: { price: 6, rarity: 'uncommon' },
    shortSeller: { price: 5, rarity: 'uncommon', multiBonus: 1 },
    trendFollower: { price: 6, rarity: 'uncommon', multiFactor: 1.5 },
    scalper: { price: 5, rarity: 'uncommon', multiBonus: 1 },
    twoPercentRule: { price: 8, rarity: 'rare', maxRiskPct: 0.02, multiFactor: 2 },
    tradingJournal: { price: 8, rarity: 'rare', multiPerWin: 0.5, minValidCards: 2, cap: 4 },
    quantAnalyst: { price: 10, rarity: 'rare', minFamilies: 2, multiFactor: 2 },
  },

  /** GDD 6.1 */
  consumables: {
    analystReport: { price: 3 },
    training: { price: 3, multiBonus: 0.5 },
    signalPack: { price: 4, choices: 3 },
    hedge: { price: 3, pnlFactor: 0.5 },
    extraOrder: { price: 3, orders: 1 },
    crystalBall: { price: 5 },
  },

  /** GDD 6 et 6.1 : boutique */
  shop: {
    toolOffers: 2,
    consumableOffers: 2,
    rerollBaseCost: 2,
    rerollIncrement: 1,
    rarityWeights: { common: 0.7, uncommon: 0.25, rare: 0.05 },
    sellRatio: 0.5,
  },

  /** GDD 7.2 : séances à événement */
  events: {
    rangeMarket: { forcedRegime: 'range' },
    earningsDay: { newsProb: 0.15 },
    doubleFees: { costMultiplier: 2 },
    lowVolatility: { sigmaMultiplier: 0.5 },
    crash: { forcedRegime: 'bear', sigmaMultiplier: 1.5 },
  },

  /** GDD 13 : vie du trader (stress, épargne, poste, logement, activités) */
  life: {
    stressStart: 15,
    stressMax: 100,
    /** Trade perdant : forfait + points par % du capital perdu. */
    lossFlat: 3,
    lossPerCapitalPct: 1.5,
    liquidation: 25,
    win: -2,
    /** Levier : points par cran au-delà de ×2, par trade, gagnant ou perdant. */
    freeLeverage: 2,
    leveragePerStep: 3,
    seanceFatigue: 10,
    eventSeance: 10,
    nervous: { threshold: 50, multi: 0.8 },
    tilt: { threshold: 80, multi: 0.6 },
    savingsStart: 60,
    salary: 60,
    /** Facteur appliqué au stress pris pendant une séance. */
    setups: {
      laptop: { price: 0, factor: 1 },
      tower: { price: 100, factor: 0.8 },
      dualScreen: { price: 200, factor: 0.6 },
    },
    /** Récupération à chaque nuit d'entracte. */
    homes: {
      studio: { price: 0, recovery: 10 },
      t2: { price: 120, recovery: 20 },
      loft: { price: 250, recovery: 30 },
    },
    activities: {
      evening: { price: 20, relief: 15 },
      spa: { price: 50, relief: 30 },
      weekend: { price: 90, relief: 50 },
      trip: { price: 150, relief: 100 },
    },
  },

  /** GDD 2.3 étape 6 */
  animation: {
    candleMs: 600,
    fastCandleMs: 200,
  },
} as const;

export type Config = typeof CONFIG;
