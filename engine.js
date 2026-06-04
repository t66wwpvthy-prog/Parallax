/* ============================================================================
   PARALLAX ENGINE  —  the heart of the model. Treat as SACRED.
   Block-bootstrap Monte Carlo on real (inflation-adjusted) returns, 1928–2025.
   Accounts: taxable / traditional / Roth. Accumulation + pension + LTC.
   Path-consistent: all scenarios can share one return-path bundle.

   RULE: Do not "improve" this casually. It is verified. If you change it,
   the tests in engine.test.js must still pass. Terminal wealth is NOT the
   objective — it is only a ranking/sorting device. The engine reports
   success, depletion, balances over time; the UI decides what to show.
   ============================================================================ */

function fundGap(accounts, gap, taxRates, strategy = 'taxable-first'){
  let remainingNeed = gap;
  const breakdown = { taxable: 0, traditional: 0, roth: 0 };
  const taxBySource = { taxable: 0, traditional: 0 };
  let totalTax = 0;

  const workingBal = {
    taxable:     accounts.taxable.balance,
    traditional: accounts.traditional.balance,
    roth:        accounts.roth.balance
  };
  let workingBasis = accounts.taxable.basis;

  const effRateFor = (type) => {
    if(type === 'taxable'){
      const gainPct = workingBal.taxable > 0
        ? Math.max(0, (workingBal.taxable - workingBasis) / workingBal.taxable)
        : 0;
      return gainPct * taxRates.capitalGains;
    }
    if(type === 'traditional') return taxRates.ordinary;
    return 0;
  };

  const drawFrom = (type, netNeeded) => {
    if(workingBal[type] <= 0.01 || netNeeded <= 0.01) return;
    const rate = effRateFor(type);
    const grossNeeded = rate < 0.999 ? netNeeded / (1 - rate) : netNeeded;
    const withdrawn   = Math.min(grossNeeded, workingBal[type]);
    const tax         = withdrawn * rate;
    breakdown[type]  += withdrawn;
    totalTax         += tax;
    if(type === 'taxable' || type === 'traditional') taxBySource[type] += tax;
    workingBal[type] -= withdrawn;
    remainingNeed    -= (withdrawn - tax);
    if(type === 'taxable' && accounts.taxable.balance > 0){
      const basisPortion = workingBasis / accounts.taxable.balance;
      workingBasis = Math.max(0, workingBasis - withdrawn * basisPortion);
    }
  };

  if(strategy === 'proportional'){
    // Draw from all three proportionally to their current balances.
    // Compute each account's share of total, then draw that share of the need.
    // Overflow from depleted accounts falls through to sequential fallback.
    const total = workingBal.taxable + workingBal.traditional + workingBal.roth;
    if(total > 0.01){
      // For proportional we solve: each account nets its share of the gap.
      // Since each account has a different effective rate, we iterate once:
      // target net from each = gap × (balance / total), gross up by that acct's rate.
      const types = ['taxable', 'traditional', 'roth'];
      types.forEach(type => {
        if(workingBal[type] <= 0.01) return;
        const share = gap * (workingBal[type] / total);
        drawFrom(type, share);
      });
    }
    // Proportional may leave a small residual if accounts were insufficient;
    // fall through to taxable-first for any remainder.
    if(remainingNeed > 0.01){
      for(const type of ['taxable', 'traditional', 'roth']){
        if(remainingNeed <= 0.01) break;
        drawFrom(type, remainingNeed);
      }
    }
  } else {
    // Sequential strategies: taxable-first or traditional-first
    const order = strategy === 'traditional-first'
      ? ['traditional', 'taxable', 'roth']
      : ['taxable', 'traditional', 'roth'];
    for(const type of order){
      if(remainingNeed <= 0.01) break;
      drawFrom(type, remainingNeed);
    }
  }

  return {
    totalWithdrawn: breakdown.taxable + breakdown.traditional + breakdown.roth,
    totalTax,
    breakdown,
    taxBySource,
    shortfall: Math.max(0, remainingNeed)
  };
}

function historicalProxyComponents(row, riskProfile){
  const alloc = HISTORICAL_PROXY_ALLOC[riskProfile] || HISTORICAL_PROXY_ALLOC[3];
  const n = HISTORICAL_NOMINAL_RETURNS[row.y];
  if(!n){
    const fallbackReal = weightedAssetReturn(row, RISK_PROFILES[riskProfile || 3].weights);
    return { nominal:null, inflation:null, real:fallbackReal, source:'fallback' };
  }

  const nominal = alloc.stock * n.stock + alloc.bond * n.bond;
  // Derive inflation/deflation from the same nominal S&P series and the file's
  // real U.S. large-cap series. This keeps the bridge internally reconcilable:
  // real = (1 + nominal) / (1 + inflation) - 1.
  const inflation = (row.usLarge != null && (1 + row.usLarge) !== 0)
    ? ((1 + n.stock) / (1 + row.usLarge)) - 1
    : null;
  const real = inflation != null
    ? ((1 + nominal) / (1 + inflation)) - 1
    : ((row.usLarge != null && row.usBonds != null) ? (alloc.stock * row.usLarge + alloc.bond * row.usBonds) : weightedAssetReturn(row, RISK_PROFILES[riskProfile || 3].weights));
  return { nominal, inflation, real, stockNominal:n.stock, bondNominal:n.bond, source:'Damodaran nominal + derived CPI bridge' };
}

/* hoisted module constants the engine depends on */
const LONGRUN_INFLATION = 0.025;

// Social Security claim-age math (modern Full Retirement Age = 67, born 1960+).
// pia = Primary Insurance Amount = the benefit at FRA. The actual benefit is the
// pia adjusted for when you actually file (the real SSA schedule):
//   • file LATE  → delayed retirement credits, +8%/yr, capped at age 70.
//   • file EARLY → permanent reduction: 5/9 of 1% per month for the first 36
//     months before FRA, then 5/12 of 1% per month beyond that. (62 = 30% cut.)
const SS_FRA = 67;
function ssAdjust(pia, claimAge){
  const c = Math.max(62, Math.min(70, claimAge));
  if(c >= SS_FRA) return pia * (1 + 0.08 * (c - SS_FRA));
  const monthsEarly = (SS_FRA - c) * 12;
  const first36 = Math.min(monthsEarly, 36);
  const beyond  = Math.max(0, monthsEarly - 36);
  return pia * (1 - (first36 * (5/900) + beyond * (5/1200)));
}

const RETURN_DATA = [
  {y:1928, usLarge:+0.4630, usSmall:+0.6495, intlDev:null   , emerging:null   , usBonds:+0.0258, cash:+0.0486, reit:null   , gold:+0.0183},
  {y:1929, usLarge:-0.0830, usSmall:-0.4608, intlDev:null   , emerging:null   , usBonds:+0.0420, cash:+0.0316, reit:null   , gold:-0.0015},
  {y:1930, usLarge:-0.2336, usSmall:-0.4713, intlDev:null   , emerging:null   , usBonds:+0.0700, cash:+0.0701, reit:null   , gold:+0.0246},
  {y:1931, usLarge:-0.3835, usSmall:-0.3811, intlDev:null   , emerging:null   , usBonds:+0.0692, cash:+0.1231, reit:null   , gold:-0.0931},
  {y:1932, usLarge:+0.0185, usSmall:+0.4342, intlDev:null   , emerging:null   , usBonds:+0.2134, cash:+0.1268, reit:null   , gold:+0.3535},
  {y:1933, usLarge:+0.5821, usSmall:+1.6019, intlDev:null   , emerging:null   , usBonds:+0.0745, cash:+0.0650, reit:null   , gold:+0.3447},
  {y:1934, usLarge:-0.0453, usSmall:+0.1891, intlDev:null   , emerging:null   , usBonds:+0.0431, cash:-0.0311, reit:null   , gold:+0.2729},
  {y:1935, usLarge:+0.4302, usSmall:+0.5097, intlDev:null   , emerging:null   , usBonds:+0.0182, cash:-0.0237, reit:null   , gold:-0.0211},
  {y:1936, usLarge:+0.3063, usSmall:+0.9447, intlDev:null   , emerging:null   , usBonds:+0.0398, cash:-0.0082, reit:null   , gold:-0.0090},
  {y:1937, usLarge:-0.3765, usSmall:-0.5558, intlDev:null   , emerging:null   , usBonds:-0.0224, cash:-0.0330, reit:null   , gold:-0.0408},
  {y:1938, usLarge:+0.3204, usSmall:+0.0721, intlDev:null   , emerging:null   , usBonds:+0.0645, cash:+0.0212, reit:null   , gold:+0.0212},
  {y:1939, usLarge:+0.0020, usSmall:-0.0361, intlDev:null   , emerging:null   , usBonds:+0.0578, cash:+0.0137, reit:null   , gold:+0.0008},
  {y:1940, usLarge:-0.1132, usSmall:-0.3335, intlDev:null   , emerging:null   , usBonds:+0.0467, cash:-0.0066, reit:null   , gold:-0.0234},
  {y:1941, usLarge:-0.1692, usSmall:-0.1119, intlDev:null   , emerging:null   , usBonds:-0.0669, cash:-0.0464, reit:null   , gold:-0.0476},
  {y:1942, usLarge:+0.0746, usSmall:+0.4699, intlDev:null   , emerging:null   , usBonds:-0.0776, cash:-0.0964, reit:null   , gold:-0.0983},
  {y:1943, usLarge:+0.1786, usSmall:+1.2904, intlDev:null   , emerging:null   , usBonds:-0.0341, cash:-0.0539, reit:null   , gold:-0.0575},
  {y:1944, usLarge:+0.1716, usSmall:+0.6845, intlDev:null   , emerging:null   , usBonds:+0.0096, cash:-0.0118, reit:null   , gold:-0.0157},
  {y:1945, usLarge:+0.3266, usSmall:+0.9003, intlDev:null   , emerging:null   , usBonds:+0.0147, cash:-0.0185, reit:null   , gold:+0.0023},
  {y:1946, usLarge:-0.1560, usSmall:-0.2049, intlDev:null   , emerging:null   , usBonds:-0.0495, cash:-0.0748, reit:null   , gold:-0.0783},
  {y:1947, usLarge:-0.0805, usSmall:-0.1413, intlDev:null   , emerging:null   , usBonds:-0.1180, cash:-0.1207, reit:null   , gold:-0.1259},
  {y:1948, usLarge:-0.0222, usSmall:-0.0750, intlDev:null   , emerging:null   , usBonds:-0.0569, cash:-0.0671, reit:null   , gold:-0.0749},
  {y:1949, usLarge:+0.1973, usSmall:+0.2915, intlDev:null   , emerging:null   , usBonds:+0.0593, cash:+0.0235, reit:null   , gold:-0.0780},
  {y:1950, usLarge:+0.2933, usSmall:+0.5085, intlDev:null   , emerging:null   , usBonds:-0.0086, cash:-0.0010, reit:null   , gold:+0.0815},
  {y:1951, usLarge:+0.1463, usSmall:-0.0373, intlDev:null   , emerging:null   , usBonds:-0.0741, cash:-0.0592, reit:null   , gold:-0.0732},
  {y:1952, usLarge:+0.1559, usSmall:-0.0115, intlDev:null   , emerging:null   , usBonds:+0.0007, cash:-0.0047, reit:null   , gold:-0.0250},
  {y:1953, usLarge:-0.0199, usSmall:-0.0671, intlDev:null   , emerging:null   , usBonds:+0.0331, cash:+0.0108, reit:null   , gold:-0.0011},
  {y:1954, usLarge:+0.5210, usSmall:+0.6450, intlDev:null   , emerging:null   , usBonds:+0.0298, cash:+0.0064, reit:null   , gold:+0.0027},
  {y:1955, usLarge:+0.3299, usSmall:+0.2710, intlDev:null   , emerging:null   , usBonds:-0.0104, cash:+0.0202, reit:null   , gold:+0.0027},
  {y:1956, usLarge:+0.0585, usSmall:-0.0235, intlDev:null   , emerging:null   , usBonds:-0.0370, cash:+0.0110, reit:null   , gold:-0.0159},
  {y:1957, usLarge:-0.1335, usSmall:-0.1791, intlDev:null   , emerging:null   , usBonds:+0.0339, cash:-0.0008, reit:null   , gold:-0.0398},
  {y:1958, usLarge:+0.3979, usSmall:+0.6420, intlDev:null   , emerging:null   , usBonds:-0.0477, cash:-0.0100, reit:null   , gold:-0.0231},
  {y:1959, usLarge:+0.1129, usSmall:+0.1191, intlDev:null   , emerging:null   , usBonds:-0.0333, cash:+0.0267, reit:null   , gold:-0.0070},
  {y:1960, usLarge:-0.0133, usSmall:-0.0518, intlDev:null   , emerging:null   , usBonds:+0.0978, cash:+0.0115, reit:null   , gold:-0.0120},
  {y:1961, usLarge:+0.2538, usSmall:+0.2817, intlDev:null   , emerging:null   , usBonds:+0.0105, cash:+0.0134, reit:null   , gold:-0.0105},
  {y:1962, usLarge:-0.0971, usSmall:-0.1067, intlDev:null   , emerging:null   , usBonds:+0.0464, cash:+0.0175, reit:null   , gold:-0.0105},
  {y:1963, usLarge:+0.2107, usSmall:+0.1813, intlDev:null   , emerging:null   , usBonds:+0.0038, cash:+0.0184, reit:null   , gold:-0.0167},
  {y:1964, usLarge:+0.1493, usSmall:+0.2167, intlDev:null   , emerging:null   , usBonds:+0.0240, cash:+0.0222, reit:null   , gold:-0.0125},
  {y:1965, usLarge:+0.1063, usSmall:+0.4295, intlDev:null   , emerging:null   , usBonds:-0.0087, cash:+0.0231, reit:null   , gold:-0.0142},
  {y:1966, usLarge:-0.1250, usSmall:-0.1202, intlDev:null   , emerging:null   , usBonds:+0.0001, cash:+0.0190, reit:null   , gold:-0.0269},
  {y:1967, usLarge:+0.2007, usSmall:+1.0844, intlDev:null   , emerging:null   , usBonds:-0.0455, cash:+0.0115, reit:null   , gold:-0.0350},
  {y:1968, usLarge:+0.0634, usSmall:+0.5421, intlDev:null   , emerging:null   , usBonds:-0.0089, cash:+0.0118, reit:null   , gold:+0.0813},
  {y:1969, usLarge:-0.1303, usSmall:-0.3645, intlDev:null   , emerging:null   , usBonds:-0.0996, cash:+0.0111, reit:null   , gold:-0.0047},
  {y:1970, usLarge:-0.0202, usSmall:-0.2308, intlDev:null   , emerging:null   , usBonds:+0.1045, cash:+0.0066, reit:null   , gold:-0.1432},
  {y:1971, usLarge:+0.0941, usSmall:+0.1108, intlDev:null   , emerging:null   , usBonds:+0.0517, cash:-0.0007, reit:null   , gold:+0.1177},
  {y:1972, usLarge:+0.1507, usSmall:-0.0314, intlDev:null   , emerging:null   , usBonds:-0.0037, cash:+0.0083, reit:null   , gold:+0.4416},
  {y:1973, usLarge:-0.1931, usSmall:-0.4237, intlDev:null   , emerging:null   , usBonds:-0.0239, cash:+0.0079, reit:null   , gold:+0.6286},
  {y:1974, usLarge:-0.3324, usSmall:-0.3414, intlDev:null   , emerging:null   , usBonds:-0.0812, cash:-0.0284, reit:null   , gold:+0.4969},
  {y:1975, usLarge:+0.2548, usSmall:+0.4636, intlDev:null   , emerging:null   , usBonds:-0.0503, cash:-0.0294, reit:null   , gold:-0.3107},
  {y:1976, usLarge:+0.1707, usSmall:+0.4047, intlDev:null   , emerging:null   , usBonds:+0.0962, cash:-0.0078, reit:null   , gold:-0.0936},
  {y:1977, usLarge:-0.1265, usSmall:+0.2234, intlDev:null   , emerging:null   , usBonds:-0.0489, cash:+0.0011, reit:null   , gold:+0.1515},
  {y:1978, usLarge:-0.0102, usSmall:+0.1980, intlDev:null   , emerging:null   , usBonds:-0.0779, cash:-0.0040, reit:null   , gold:+0.2742},
  {y:1979, usLarge:+0.0649, usSmall:+0.2702, intlDev:null   , emerging:null   , usBonds:-0.0955, cash:-0.0238, reit:null   , gold:+1.0355},
  {y:1980, usLarge:+0.1607, usSmall:+0.2504, intlDev:null   , emerging:null   , usBonds:-0.1453, cash:-0.0186, reit:null   , gold:+0.0148},
  {y:1981, usLarge:-0.1370, usSmall:-0.1322, intlDev:null   , emerging:null   , usBonds:-0.0190, cash:+0.0339, reit:null   , gold:-0.3877},
  {y:1982, usLarge:+0.1339, usSmall:+0.1944, intlDev:null   , emerging:null   , usBonds:+0.2486, cash:+0.0460, reit:null   , gold:+0.0887},
  {y:1983, usLarge:+0.1854, usSmall:+0.3010, intlDev:null   , emerging:null   , usBonds:+0.0000, cash:+0.0556, reit:null   , gold:-0.1939},
  {y:1984, usLarge:+0.0177, usSmall:-0.1898, intlDev:null   , emerging:null   , usBonds:+0.0904, cash:+0.0539, reit:null   , gold:-0.2281},
  {y:1985, usLarge:+0.2640, usSmall:+0.2620, intlDev:+0.5030, emerging:+0.2290, usBonds:+0.1760, cash:+0.0380, reit:+0.1460, gold:+0.0170},
  {y:1986, usLarge:+0.1680, usSmall:+0.0450, intlDev:+0.6750, emerging:+0.1040, usBonds:+0.1390, cash:+0.0500, reit:+0.1770, gold:+0.1790},
  {y:1987, usLarge:+0.0030, usSmall:-0.1270, intlDev:+0.1930, emerging:+0.0930, usBonds:-0.0280, cash:+0.0130, reit:-0.0780, gold:+0.1900},
  {y:1988, usLarge:+0.1130, usSmall:+0.1970, intlDev:+0.2280, emerging:+0.3390, usBonds:+0.0280, cash:+0.0210, reit:+0.0860, gold:-0.1960},
  {y:1989, usLarge:+0.2550, usSmall:+0.1100, intlDev:+0.0560, emerging:+0.5690, usBonds:+0.0860, cash:+0.0370, reit:+0.0390, gold:-0.0680},
  {y:1990, usLarge:-0.0890, usSmall:-0.2280, intlDev:-0.2790, emerging:-0.1610, usBonds:+0.0240, cash:+0.0160, reit:-0.2030, gold:-0.0830},
  {y:1991, usLarge:+0.2630, usSmall:+0.4090, intlDev:+0.0870, emerging:+0.5450, usBonds:+0.1180, cash:+0.0250, reit:+0.3150, gold:-0.1250},
  {y:1992, usLarge:+0.0440, usSmall:+0.1490, intlDev:-0.1470, emerging:+0.0780, usBonds:+0.0410, cash:+0.0060, reit:+0.1120, gold:-0.0870},
  {y:1993, usLarge:+0.0700, usSmall:+0.1550, intlDev:+0.2890, emerging:+0.6940, usBonds:+0.0670, cash:+0.0020, reit:+0.1630, gold:+0.1390},
  {y:1994, usLarge:-0.0150, usSmall:-0.0310, intlDev:+0.0490, emerging:-0.1010, usBonds:-0.0520, cash:+0.0130, reit:+0.0040, gold:-0.0490},
  {y:1995, usLarge:+0.3400, usSmall:+0.2560, intlDev:+0.0840, emerging:-0.0190, usBonds:+0.1530, cash:+0.0310, reit:+0.1000, gold:-0.0170},
  {y:1996, usLarge:+0.1890, usSmall:+0.1430, intlDev:+0.0260, emerging:+0.1210, usBonds:+0.0030, cash:+0.0190, reit:+0.3140, gold:-0.0770},
  {y:1997, usLarge:+0.3100, usSmall:+0.2250, intlDev:+0.0000, emerging:-0.1820, usBonds:+0.0760, cash:+0.0350, reit:+0.1680, gold:-0.2320},
  {y:1998, usLarge:+0.2660, usSmall:-0.0420, intlDev:+0.1800, emerging:-0.1940, usBonds:+0.0690, cash:+0.0350, reit:-0.1770, gold:-0.0240},
  {y:1999, usLarge:+0.1790, usSmall:+0.1990, intlDev:+0.2360, emerging:+0.5730, usBonds:-0.0340, cash:+0.0200, reit:-0.0650, gold:-0.0170},
  {y:2000, usLarge:-0.1200, usSmall:-0.0580, intlDev:-0.1710, emerging:-0.2990, usBonds:+0.0770, cash:+0.0250, reit:+0.2220, gold:-0.0960},
  {y:2001, usLarge:-0.1330, usSmall:+0.0160, intlDev:-0.2310, emerging:-0.0440, usBonds:+0.0680, cash:+0.0260, reit:+0.1070, gold:-0.0040},
  {y:2002, usLarge:-0.2390, usSmall:-0.2180, intlDev:-0.1760, emerging:-0.0960, usBonds:+0.0580, cash:-0.0070, reit:+0.0130, gold:+0.2080},
  {y:2003, usLarge:+0.2620, usSmall:+0.4310, intlDev:+0.3610, emerging:+0.5470, usBonds:+0.0210, cash:-0.0090, reit:+0.3330, gold:+0.1920},
  {y:2004, usLarge:+0.0730, usSmall:+0.1620, intlDev:+0.1650, emerging:+0.2210, usBonds:+0.0100, cash:-0.0200, reit:+0.2670, gold:+0.0140},
  {y:2005, usLarge:+0.0140, usSmall:+0.0390, intlDev:+0.0980, emerging:+0.2770, usBonds:-0.0090, cash:-0.0050, reit:+0.0830, gold:+0.1300},
  {y:2006, usLarge:+0.1290, usSmall:+0.1290, intlDev:+0.2310, emerging:+0.2630, usBonds:+0.0180, cash:+0.0210, reit:+0.3180, gold:+0.1930},
  {y:2007, usLarge:+0.0130, usSmall:-0.0270, intlDev:+0.0680, emerging:+0.3360, usBonds:+0.0280, cash:+0.0070, reit:-0.1970, gold:+0.2580},
  {y:2008, usLarge:-0.3700, usSmall:-0.3610, intlDev:-0.4130, emerging:-0.5280, usBonds:+0.0510, cash:+0.0200, reit:-0.3700, gold:+0.0540},
  {y:2009, usLarge:+0.2330, usSmall:+0.3270, intlDev:+0.2490, emerging:+0.7150, usBonds:+0.0320, cash:-0.0240, reit:+0.2630, gold:+0.2020},
  {y:2010, usLarge:+0.1340, usSmall:+0.2600, intlDev:+0.0680, emerging:+0.1720, usBonds:+0.0500, cash:-0.0150, reit:+0.2660, gold:+0.2600},
  {y:2011, usLarge:-0.0090, usSmall:-0.0550, intlDev:-0.1500, emerging:-0.2100, usBonds:+0.0460, cash:-0.0290, reit:+0.0550, gold:+0.0550},
  {y:2012, usLarge:+0.1400, usSmall:+0.1620, intlDev:+0.1650, emerging:+0.1680, usBonds:+0.0240, cash:-0.0170, reit:+0.1570, gold:+0.0650},
  {y:2013, usLarge:+0.3040, usSmall:+0.3580, intlDev:+0.2030, emerging:-0.0640, usBonds:-0.0360, cash:-0.0150, reit:+0.0090, gold:-0.2900},
  {y:2014, usLarge:+0.1280, usSmall:+0.0670, intlDev:-0.0640, emerging:-0.0020, usBonds:+0.0510, cash:-0.0070, reit:+0.2930, gold:-0.0120},
  {y:2015, usLarge:+0.0060, usSmall:-0.0430, intlDev:-0.0090, emerging:-0.1600, usBonds:-0.0030, cash:-0.0070, reit:+0.0160, gold:-0.1230},
  {y:2016, usLarge:+0.0970, usSmall:+0.1590, intlDev:+0.0040, emerging:+0.0950, usBonds:+0.0050, cash:-0.0180, reit:+0.0630, gold:+0.0660},
  {y:2017, usLarge:+0.1930, usSmall:+0.1380, intlDev:+0.2380, emerging:+0.2870, usBonds:+0.0140, cash:-0.0130, reit:+0.0280, gold:+0.0930},
  {y:2018, usLarge:-0.0620, usSmall:-0.1100, intlDev:-0.1610, emerging:-0.1620, usBonds:-0.0190, cash:-0.0010, reit:-0.0770, gold:-0.0320},
  {y:2019, usLarge:+0.2850, usSmall:+0.2450, intlDev:+0.1930, emerging:+0.1760, usBonds:+0.0630, cash:-0.0010, reit:+0.2610, gold:+0.1590},
  {y:2020, usLarge:+0.1670, usSmall:+0.1750, intlDev:+0.0870, emerging:+0.1360, usBonds:+0.0610, cash:-0.0090, reit:-0.0600, gold:+0.2330},
  {y:2021, usLarge:+0.2020, usSmall:+0.1000, intlDev:+0.0410, emerging:-0.0580, usBonds:-0.0830, cash:-0.0650, reit:+0.3120, gold:-0.1030},
  {y:2022, usLarge:-0.2360, usSmall:-0.2310, intlDev:-0.2090, emerging:-0.2320, usBonds:-0.1900, cash:-0.0520, reit:-0.3110, gold:-0.0720},
  {y:2023, usLarge:+0.2210, usSmall:+0.1560, intlDev:+0.1380, emerging:+0.0520, usBonds:+0.0230, cash:+0.0160, reit:+0.0940, gold:+0.0910},
  {y:2024, usLarge:+0.2140, usSmall:+0.0980, intlDev:+0.0010, emerging:+0.0820, usBonds:-0.0160, cash:+0.0230, reit:+0.0070, gold:+0.2330},
  {y:2025, usLarge:+0.1480, usSmall:+0.0983, intlDev:+0.2775, emerging:+0.3087, usBonds:+0.0448, cash:+0.0156, reit:-0.0039, gold:+0.6066}
];

// ─── SECTION 2 — ASSET CLASS DEFINITIONS ─────────────────────────────────
const ASSET_META = {
  usLarge:  { label:'US Large Cap',     ticker:'VFIAX', bucket:'growth',     era:'full' },
  usSmall:  { label:'US Small Cap',     ticker:'VSMAX', bucket:'growth',     era:'full' },
  intlDev:  { label:"Int'l Developed",  ticker:'VTMGX', bucket:'growth',     era:'post1985' },
  emerging: { label:'Emerging Markets', ticker:'VEMAX', bucket:'growth',     era:'post1985' },
  usBonds:  { label:'US Bonds',         ticker:'VBTLX', bucket:'defensive',  era:'full' },
  cash:     { label:'Cash · T-Bill',    ticker:'VUSXX', bucket:'cash',       era:'full' },
  reit:     { label:'REIT',             ticker:'VGSLX', bucket:'growth',     era:'post1985' },
  gold:     { label:'Gold',             ticker:'IAU',   bucket:'diversifier',era:'full' }
};
const ASSET_KEYS = Object.keys(ASSET_META);

// Equity (growth) and defensive sleeve mixes — renormalized for 8-asset universe.
const EQUITY_MIX = {
  usLarge: .50, usSmall: .10, intlDev: .22, emerging: .08, reit: .10
};
const DEFENSIVE_MIX = {
  usBonds: .75, cash: .17, gold: .08
};
function buildAssetWeights(eqShare){
  const fiShare = 1 - eqShare;
  const w = {};
  ASSET_KEYS.forEach(k => w[k] = 0);
  Object.keys(EQUITY_MIX).forEach(k => w[k] += eqShare * EQUITY_MIX[k]);
  Object.keys(DEFENSIVE_MIX).forEach(k => w[k] += fiShare * DEFENSIVE_MIX[k]);
  return w;
}
const RISK_PROFILES = {
  1: { label:'Conservative',   alloc:'30.00% Growth · 70.00% Defensive', eq:.30000, fi:.70000, weights:buildAssetWeights(.30000) },
  2: { label:'Balanced Cons.', alloc:'45.00% Growth · 55.00% Defensive', eq:.45000, fi:.55000, weights:buildAssetWeights(.45000) },
  3: { label:'Moderate',       alloc:'60.00% Growth · 40.00% Defensive', eq:.60000, fi:.40000, weights:buildAssetWeights(.60000) },
  4: { label:'Growth',         alloc:'75.00% Growth · 25.00% Defensive', eq:.75000, fi:.25000, weights:buildAssetWeights(.75000) },
  5: { label:'Aggressive',     alloc:'90.00% Growth · 10.00% Defensive', eq:.90000, fi:.10000, weights:buildAssetWeights(.90000) },
  6: { label:'All Equity',     alloc:'100.00% Growth · 0.00% Defensive', eq:1.00000, fi:.00000, weights:buildAssetWeights(1.00000) }
};

// Historical Playback uses a clean U.S. stock / U.S. bond proxy rather than the
// full modern asset-class blend. This is intentionally simpler and more
// defensible for early historical periods: R3 = 60/40 stock/bond, with R1 at
// 30/70 and R6 at 100% equity.
const HISTORICAL_PROXY_ALLOC = {
  1: { stock:.30, bond:.70 },
  2: { stock:.45, bond:.55 },
  3: { stock:.60, bond:.40 },
  4: { stock:.75, bond:.25 },
  5: { stock:.90, bond:.10 },
  6: { stock:1.00, bond:.00 }
};


// Nominal stock/bond returns for historical playback bridge.
// Source: Aswath Damodaran, Historical Returns on Stocks, Bonds and Bills, 1928-2025.
// Columns used: S&P 500 (includes dividends), US T. Bond (10-year).
// Inflation is derived by reconciling the nominal S&P return with the existing real-return
// US large-cap series: inflation = (1 + nominal S&P) / (1 + real US large-cap) - 1.
const HISTORICAL_NOMINAL_RETURNS = {
  1928:{stock:.4381,bond:.0084}, 1929:{stock:-.0830,bond:.0420}, 1930:{stock:-.2512,bond:.0454},
  1931:{stock:-.4384,bond:-.0256}, 1932:{stock:-.0864,bond:.0879}, 1933:{stock:.4998,bond:.0186},
  1934:{stock:-.0119,bond:.0796}, 1935:{stock:.4674,bond:.0447}, 1936:{stock:.3194,bond:.0502},
  1937:{stock:-.3534,bond:.0138}, 1938:{stock:.2928,bond:.0421}, 1939:{stock:-.0110,bond:.0441},
  1940:{stock:-.1067,bond:.0540}, 1941:{stock:-.1277,bond:-.0202}, 1942:{stock:.1917,bond:.0229},
  1943:{stock:.2506,bond:.0249}, 1944:{stock:.1903,bond:.0258}, 1945:{stock:.3582,bond:.0380},
  1946:{stock:-.0843,bond:.0313}, 1947:{stock:.0520,bond:.0092}, 1948:{stock:.0570,bond:.0195},
  1949:{stock:.1830,bond:.0466}, 1950:{stock:.3081,bond:.0043}, 1951:{stock:.2368,bond:-.0030},
  1952:{stock:.1815,bond:.0227}, 1953:{stock:-.0121,bond:.0414}, 1954:{stock:.5256,bond:.0329},
  1955:{stock:.3260,bond:-.0134}, 1956:{stock:.0744,bond:-.0226}, 1957:{stock:-.1046,bond:.0680},
  1958:{stock:.4372,bond:-.0210}, 1959:{stock:.1206,bond:-.0265}, 1960:{stock:.0034,bond:.1164},
  1961:{stock:.2664,bond:.0206}, 1962:{stock:-.0881,bond:.0569}, 1963:{stock:.2261,bond:.0168},
  1964:{stock:.1642,bond:.0373}, 1965:{stock:.1240,bond:.0072}, 1966:{stock:-.0997,bond:.0291},
  1967:{stock:.2380,bond:-.0158}, 1968:{stock:.1081,bond:.0327}, 1969:{stock:-.0824,bond:-.0501},
  1970:{stock:.0356,bond:.1675}, 1971:{stock:.1422,bond:.0979}, 1972:{stock:.1876,bond:.0282},
  1973:{stock:-.1431,bond:.0366}, 1974:{stock:-.2590,bond:.0199}, 1975:{stock:.3700,bond:.0361},
  1976:{stock:.2383,bond:.1598}, 1977:{stock:-.0698,bond:.0129}, 1978:{stock:.0651,bond:-.0078},
  1979:{stock:.1852,bond:.0067}, 1980:{stock:.3174,bond:-.0299}, 1981:{stock:-.0470,bond:.0820},
  1982:{stock:.2042,bond:.3281}, 1983:{stock:.2234,bond:.0320}, 1984:{stock:.0615,bond:.1373},
  1985:{stock:.3124,bond:.2571}, 1986:{stock:.1849,bond:.2428}, 1987:{stock:.0581,bond:-.0496},
  1988:{stock:.1654,bond:.0822}, 1989:{stock:.3148,bond:.1769}, 1990:{stock:-.0306,bond:.0624},
  1991:{stock:.3023,bond:.1500}, 1992:{stock:.0749,bond:.0936}, 1993:{stock:.0997,bond:.1421},
  1994:{stock:.0133,bond:-.0804}, 1995:{stock:.3720,bond:.2348}, 1996:{stock:.2268,bond:.0143},
  1997:{stock:.3310,bond:.0994}, 1998:{stock:.2834,bond:.1492}, 1999:{stock:.2089,bond:-.0825},
  2000:{stock:-.0903,bond:.1666}, 2001:{stock:-.1185,bond:.0557}, 2002:{stock:-.2197,bond:.1512},
  2003:{stock:.2836,bond:.0038}, 2004:{stock:.1074,bond:.0449}, 2005:{stock:.0483,bond:.0287},
  2006:{stock:.1561,bond:.0196}, 2007:{stock:.0548,bond:.1021}, 2008:{stock:-.3655,bond:.2010},
  2009:{stock:.2594,bond:-.1112}, 2010:{stock:.1482,bond:.0846}, 2011:{stock:.0210,bond:.1604},
  2012:{stock:.1589,bond:.0297}, 2013:{stock:.3215,bond:-.0910}, 2014:{stock:.1352,bond:.1075},
  2015:{stock:.0138,bond:.0128}, 2016:{stock:.1177,bond:.0069}, 2017:{stock:.2161,bond:.0280},
  2018:{stock:-.0423,bond:-.0002}, 2019:{stock:.3121,bond:.0964}, 2020:{stock:.1802,bond:.1133},
  2021:{stock:.2847,bond:-.0442}, 2022:{stock:-.1804,bond:-.1783}, 2023:{stock:.2606,bond:.0388},
  2024:{stock:.2488,bond:-.0164}, 2025:{stock:.1778,bond:.0780}
};

// ─── Per-asset stats (computed across each asset's available years) ─────
function computeAssetStats(data){
  const out = {};
  ASSET_KEYS.forEach(k => {
    const vals = data.map(r => r[k]).filter(v => v !== null && v !== undefined);
    const n = vals.length;
    if(n === 0){ out[k] = {mean:0, stdev:0, cagr:0, n:0, min:0, max:0}; return; }
    const mean = vals.reduce((a,b)=>a+b,0) / n;
    const variance = vals.reduce((a,b)=>a + Math.pow(b-mean,2),0) / Math.max(n-1,1);
    const cagr = Math.pow(vals.reduce((p,v)=>p*(1+v),1), 1/n) - 1;
    out[k] = {
      mean, stdev: Math.sqrt(variance), cagr, n,
      min: Math.min(...vals), max: Math.max(...vals)
    };
  });
  return out;
}
const ASSET_STATS = computeAssetStats(RETURN_DATA);

// ─── SECTION 3 — PLAN STATE ──────────────────────────────────────────────
// Portfolio is now a structured account container rather than a single balance.
// Three account types are modeled:
//   • Taxable: standard brokerage. Tracks both balance and cost basis. On
//     withdrawal, only the gain portion (balance minus basis) is taxed, and
//     at the long-term capital gains rate. Returns generate gains but don't
//     change basis, so the gain proportion grows as the account compounds.
//   • Traditional: IRA, 401(k), 403(b), etc. Entire withdrawal is taxed at
//     the ordinary income rate. (RMD modeling deferred to next phase.)
//   • Roth: Roth IRA, Roth 401(k). Withdrawals are tax-free.
//
// Tax rates split into ordinary income (used for traditional IRA withdrawals
// and the 85% taxable portion of Social Security) and long-term capital gains
// (used for the gain portion of taxable account withdrawals).
const plan = {
  meta: { version: 'v3.0-ledger', name: 'Demo Household', householdId: null, primaryName: '', spouseName: '', spouseAge: null, location: '', familyNotes: '' },
  household: { primary: { currentAge: 65, planEndAge: 95, retirementAge: 65 }, spouse: null },
  portfolio: {
    riskProfile: 3,
    withdrawalStrategy: 'taxable-first',
    accounts: {
      taxable:     { balance: 2000000, basisPct: 0.60 },  // 60% basis, 40% gain
      traditional: { balance: 2000000 },                   // pre-tax retirement
      roth:        { balance: 1000000 }                     // tax-free
    },
    extraAccounts: []   // typed accounts (401k, SEP, …) that fold into a tax sleeve
  },
  savings: { annual: 0, split: { traditional: 1, roth: 0, taxable: 0 } },   // pre-retirement contribution ($/yr) + sleeve split — only applies when retirementAge > currentAge
  income: {
    // Social Security — per person. pia = the benefit at Full Retirement Age
    // (today's dollars), i.e. the number off the SSA statement. claimAge sets
    // when they file (62–70); the engine actuarially adjusts pia for that age.
    // spouse: null when single; otherwise { pia, claimAge }.
    socialSecurity: { primary: { pia: 36000, claimAge: 67 }, spouse: null },
    // Other income — an ARRAY of variable / time-limited streams (rental, part-time,
    // a fixed-period annuity). Each: { label, amount ($/yr, today's dollars),
    // startAge, endAge, realGrowth, taxablePct }.
    //   realGrowth: per-stream REAL growth/yr from its own startAge. 0 = flat real
    //     (the legacy default). Positive = rises above inflation (rent indexed up);
    //     NEGATIVE = phases down in real terms (part-time wind-down).
    //   taxablePct: share taxed at the ordinary rate. 1 = fully taxable (legacy
    //     default); <1 models partly/fully tax-free income (return of capital,
    //     muni interest, gifts received).
    // Both default to the prior flat-real, fully-taxed behavior, so existing plans
    // are unchanged. A legacy single {amount,startAge,endAge} object is still
    // accepted (wrapped into a one-element array).
    other:          [],
    // Pension: a DISCRETE benefit-by-age map taken straight off the plan statement
    // ({ age: annualBenefit, ... }) — the advisor enters only ages they actually
    // have a number for. The engine NEVER interpolates or extrapolates a missing
    // age (that would invent data we don't have). startAge = the chosen collection
    // age; if it isn't a key in benefitByAge the modeled benefit is 0. COLA =
    // nominal annual escalator (0 = none), modeled like the SS COLA. `base` is kept
    // only as a legacy single-amount fallback.
    pension:        { benefitByAge: {}, base: 0, startAge: 65, colaPct: 0 }
  },
  // expenses: the fixed essential scalars PLUS `extra` — an array of discretionary,
  // time-bounded spending lines ({ label, amount, startAge, endAge }). Discretionary
  // extras flex with the spending lever (spendMult), flat-real otherwise. Empty default.
  // healthcareRealGrowth: annual real growth rate for healthcare above general CPI
  // (historically ~2%/yr; 0 = flat real). Applied from retirement age forward.
  expenses:   { living: 188000, housing: 0, debt: 0, healthcare: 12000, extra: [], healthcareRealGrowth: 0.02 },
  // Recurring time-bounded obligations (a mortgage, a car loan, a tuition plan).
  // Each: { label, amount ($/yr, today's dollars), startAge, endAge, colaPct }.
  // colaPct is the NOMINAL annual escalator like the pension: 0 = a fixed-nominal
  // payment, which the real-dollar engine erodes at −LONGRUN_INFLATION (a fixed
  // mortgage gets cheaper in real terms over its term). Empty by default.
  liabilities: [],
  // Properties — real assets, each with an OPTIONAL engine-native mortgage. The
  // engine amortizes the mortgage ({ balance, rate %, termYears }) into a fixed
  // annual payment that runs as a liability until payoff (startAge + termYears),
  // eroding in real terms like any fixed-nominal debt. `value` (current) and
  // `purchasePrice` (cost basis) stay INERT until a sale is triggered.
  //   commissionPct: total agent commission deducted from gross proceeds (default
  //     5%; set 0 for a business or FSBO sale).
  //   appreciation: real growth/yr of the asset's value until sale (default 0 =
  //     holds today's value in real terms).
  // The SALE itself is never stored here — it's an `assetSale` OVERRIDE applied
  // per scenario ({ asset: <index>, age: <saleAge> }), so the Baseline never
  // carries it and there's nothing to "zero out" to compare sell-vs-keep.
  properties: [],
  ltc:        { amount: 0, onsetAge: 85 },   // flat long-term-care cost ($/yr) from onsetAge onward
  // goals — an ARRAY of spend goals ({ name, amount, startAge, endAge }). A recurring
  // goal spans many years; a ONE-TIME goal is a single-year window (startAge===endAge).
  // Applied flat-real. A legacy { vacation, property, gifts } object is still accepted.
  goals:      [
    { name:'Vacation',         amount:15000, startAge:0, endAge:999 },
    { name:'Home improvements', amount:10000, startAge:0, endAge:999 },
    { name:'Gifts',            amount:5000,  startAge:0, endAge:999 },
  ],
  taxes:      { ordinary: 22, capitalGains: 15 },
  simulation: { iterations: 1000 }
};

// Standard fixed-rate amortization → the NOMINAL ANNUAL payment (12 monthly
// payments). `ratePct` is the APR in percent; rate 0 → straight-line. This is the
// ONLY mortgage math the engine derives; the resulting payment is then run through
// the existing (tested) liability cash-flow path, so mortgages add no new sim-loop
// surface. Returns 0 for a paid-off or term-less loan.
function annualMortgagePayment(balance, ratePct, termYears){
  const P = Math.max(0, balance || 0);
  const yrs = Math.max(0, termYears || 0);
  if(P <= 0 || yrs <= 0) return 0;
  const mr = (Math.max(0, ratePct || 0) / 100) / 12;
  const N  = yrs * 12;
  const monthly = (mr < 1e-9) ? P / N : (P * mr) / (1 - Math.pow(1 + mr, -N));
  return monthly * 12;
}

// Remaining NOMINAL balance of an amortizing loan after `yearsElapsed`. Mirrors
// annualMortgagePayment's monthly compounding so the payoff figure when a
// property is SOLD mid-term reconciles with the payment that's been running.
function mortgageBalanceRemaining(balance, ratePct, termYears, yearsElapsed){
  const P = Math.max(0, balance || 0);
  const yrs = Math.max(0, termYears || 0);
  if(P <= 0 || yrs <= 0) return 0;
  const mr = (Math.max(0, ratePct || 0) / 12) / 100;
  const N  = yrs * 12;
  const n  = Math.max(0, Math.min(N, Math.round((yearsElapsed || 0) * 12)));
  if(mr < 1e-9) return P * (1 - n / N);                       // 0% = straight-line
  return P * (Math.pow(1 + mr, N) - Math.pow(1 + mr, n)) / (Math.pow(1 + mr, N) - 1);
}



// Seeded RNG (mulberry32). The bootstrap draws are deterministic so identical
// inputs reproduce an identical success % — no sampling drift on page refresh.
// Distribution is unchanged; this only fixes *which* draws come out. Call
// resetSeed() before generating a bundle to reproduce it; pass a fresh seed
// (e.g. Date.now()) only if you deliberately want a new random bundle.
const DEFAULT_SEED = 0x9e3779b9;
let _rngState = DEFAULT_SEED >>> 0;
function resetSeed(seed = DEFAULT_SEED){ _rngState = seed >>> 0; }
function rand(){
  _rngState = (_rngState + 0x6D2B79F5) >>> 0;
  let t = _rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function generateReturnPath(horizonYears){
  const path = [];
  const minBlock = 3, maxBlock = 5;
  while(path.length < horizonYears){
    const blockLen = minBlock + Math.floor(rand() * (maxBlock - minBlock + 1));
    const maxStart = RETURN_DATA.length - blockLen;
    const startIdx = Math.floor(rand() * (maxStart + 1));
    for(let i = 0; i < blockLen && path.length < horizonYears; i++){
      path.push(RETURN_DATA[startIdx + i]);
    }
  }
  return path;
}


function weightedAssetReturn(row, weights){
  const sleeves = [
    ASSET_KEYS.filter(k => ASSET_META[k].bucket === 'growth'),
    ASSET_KEYS.filter(k => ASSET_META[k].bucket !== 'growth')
  ];

  let weightedReturn = 0;
  let unresolvedWeight = 0;

  sleeves.forEach(keys => {
    const sleeveTargetWeight = keys.reduce((sum, k) => sum + (weights[k] || 0), 0);
    if(sleeveTargetWeight <= 1e-9) return;

    const availableKeys = keys.filter(k => row[k] !== null && row[k] !== undefined);
    const availableSleeveWeight = availableKeys.reduce((sum, k) => sum + (weights[k] || 0), 0);

    if(availableSleeveWeight <= 1e-9){
      unresolvedWeight += sleeveTargetWeight;
      return;
    }

    availableKeys.forEach(k => {
      const sleeveWeight = (weights[k] || 0) / availableSleeveWeight;
      weightedReturn += sleeveTargetWeight * sleeveWeight * row[k];
    });
  });

  // Fallback for any future dataset row where an entire sleeve is unavailable.
  // This should not trigger with the current 1928–2025 dataset, but prevents a
  // silent zero-return sleeve if future data coverage changes.
  if(unresolvedWeight > 1e-9){
    const availableKeys = ASSET_KEYS.filter(k => row[k] !== null && row[k] !== undefined);
    const availableWeight = availableKeys.reduce((sum, k) => sum + (weights[k] || 0), 0);
    if(availableWeight > 1e-9){
      availableKeys.forEach(k => {
        weightedReturn += unresolvedWeight * ((weights[k] || 0) / availableWeight) * row[k];
      });
    }
  }

  return weightedReturn;
}


function runSimulation(plan, overrides = {}, returnPaths = null){
  const inputs = resolveInputs(plan, overrides);
  const sims = [];
  // When a return-path bundle is supplied it is authoritative: iterate over
  // exactly those paths so identical inputs + identical paths are reproducible.
  // (Silently generating random fill paths for missing indices broke that.)
  const iterations = returnPaths ? returnPaths.length : inputs.iterations;
  for(let s = 0; s < iterations; s++){
    const returnPath = returnPaths
      ? returnPaths[s]
      : generateReturnPath(inputs.horizonYears);
    const sim = runSinglePath(inputs, returnPath);
    sim.simIndex = s;  // anchor for path-coherent cross-strategy comparison
    sim.returnPath = returnPath;  // preserve coherent path for summary resilience / elasticity diagnostics
    sims.push(sim);
  }
  return analyzeResults(sims, inputs);
}


function resolveInputs(plan, ov){
  const profile = RISK_PROFILES[plan.portfolio.riskProfile];
  const horizon = (plan.household.primary.planEndAge + (ov.longevityYears || 0))
                  - plan.household.primary.currentAge;
  const equityShockShare = profile.eq;

  // Social Security — per person. Each benefit is the pia (benefit at FRA, today's
  // dollars) actuarially adjusted for the actual claim age, haircut by any ssCut
  // stress, then mapped onto the PRIMARY's age timeline (the frame the sim runs in)
  // so a spouse of a different age switches on at the right simulation year.
  // ssDelayYears (the SS Start Age lever) is a SIGNED shift to the PRIMARY's claim
  // age; the spouse keeps their own claim age (edited on the input page).
  const ssCfg = plan.income.socialSecurity || {};
  const ssCutMult = 1 - (ov.ssCut || 0);
  const ssDelta = ov.ssDelayYears || 0;
  const pCurAge = plan.household.primary.currentAge;
  const spouseCurAge = (plan.household.spouse && plan.household.spouse.currentAge != null)
                       ? plan.household.spouse.currentAge : pCurAge;
  const ssBenefits = [];
  function addSS(person, isPrimary){
    if(!person || !(person.pia > 0)) return;
    const claim = Math.max(62, Math.min(70, (person.claimAge != null ? person.claimAge : SS_FRA)
                                            + (isPrimary ? ssDelta : 0)));
    const personCurAge = isPrimary ? pCurAge : spouseCurAge;
    ssBenefits.push({
      amount:   ssAdjust(person.pia, claim) * ssCutMult,
      startAge: pCurAge + (claim - personCurAge)   // claim age expressed in the primary's age frame
    });
  }
  addSS(ssCfg.primary, true);
  addSS(ssCfg.spouse, false);

  // Spend cut: proportional reduction across all expense categories.
  // spendCut reduces spending (stress); spendBump raises it (elasticity probe).
  const spendMult = (1 - Math.max(0, Math.min(0.5, ov.spendCut || 0))) * (1 + Math.max(0, ov.spendBump || 0));

  // Initial shock: applied to the equity portion of each account proportionally.
  // Since all accounts share the same risk profile, all receive the same hit.
  // For taxable accounts, the basis remains unchanged on a market drop —
  // basis is the cost paid, not the current value, so a -20% market move
  // doesn't change what the client originally paid in.
  const shockMult = 1 - (ov.initialShock || 0) * equityShockShare;
  // Typed accounts (401k, SEP, etc.) fold into their tax sleeve before shock/basis
  // so the engine sees correct bucket totals. Default (no extras) is byte-identical.
  const extras = plan.portfolio.extraAccounts || [];
  const sumBucket = b => extras.reduce((s,a)=> s + (a.bucket===b ? Math.max(0, a.balance||0) : 0), 0);
  const taxableRaw = (plan.portfolio.accounts.taxable.balance     || 0) + sumBucket('taxable');
  const tradRaw    = (plan.portfolio.accounts.traditional.balance || 0) + sumBucket('traditional');
  const rothRaw    = (plan.portfolio.accounts.roth.balance        || 0) + sumBucket('roth');
  const accounts = {
    taxable: {
      balance: taxableRaw * shockMult,
      // Basis as absolute dollars (was stored as percent of original balance).
      // We convert here to make the engine math simpler downstream.
      basis: taxableRaw * plan.portfolio.accounts.taxable.basisPct
    },
    traditional: {
      balance: tradRaw * shockMult
    },
    roth: {
      balance: rothRaw * shockMult
    }
  };

  // ── Accumulation, pension, and LTC resolution (all no-op at plan defaults) ──
  const curAge        = plan.household.primary.currentAge;
  const retirementAge = Math.max(curAge, (plan.household.primary.retirementAge != null
                          ? plan.household.primary.retirementAge : curAge) + (ov.retireDelay || 0));
  const savingsAnnual = Math.max(0, ((plan.savings && plan.savings.annual) || 0) * (1 + (ov.savingsBump || 0)));
  // Contribution split — where accumulation savings land across the three sleeves.
  // Default 100% pre-tax (Traditional) so existing plans are byte-identical. Lets
  // high earners model Roth (backdoor) and post-tax brokerage contributions. The
  // ov.savingsSplit override (if given) wins over the plan's split.
  const rawSplit = ov.savingsSplit || (plan.savings && plan.savings.split) || null;
  let savingsSplit;
  if(!rawSplit){
    savingsSplit = { traditional: 1, roth: 0, taxable: 0 };   // back-compat default
  } else {
    // A split object is given (plan or override): missing keys are 0, not 1.
    const _st = Math.max(0, rawSplit.traditional || 0);
    const _sr = Math.max(0, rawSplit.roth || 0);
    const _sx = Math.max(0, rawSplit.taxable || 0);
    const _ssum = _st + _sr + _sx;
    savingsSplit = _ssum > 0
      ? { traditional: _st/_ssum, roth: _sr/_ssum, taxable: _sx/_ssum }
      : { traditional: 1, roth: 0, taxable: 0 };
  }
  const pen           = plan.income.pension || {};
  // Chosen collection age. The UI computes this (retirement-linked or custom) and
  // passes it as an absolute override; fall back to the plan's startAge (+ legacy
  // pensionDelay) when no absolute age is supplied.
  const penStartAge   = (ov.pensionStartAge != null ? ov.pensionStartAge
                          : (pen.startAge != null ? pen.startAge : 65) + (ov.pensionDelay || 0));
  // Discrete lookup: use ONLY the amount explicitly entered for this exact age.
  // A missing age means no modeled benefit (0) — we never invent the number.
  // `base` remains a legacy fallback for plans that still carry a single amount.
  const byAge         = pen.benefitByAge || {};
  const penEntered    = (byAge[penStartAge] != null) ? byAge[penStartAge] : pen.base;
  const penBase       = Math.max(0, (penEntered || 0));
  // Pension COLA: advisor enters a NOMINAL annual COLA% (like the SS COLA).
  // Engine is real-dollar, so convert to real drift: real = nominalCOLA − inflation.
  // 0% COLA → −inflation (flat-nominal pension erodes); COLA = inflation → flat real.
  const penColaReal = ((pen.colaPct || 0) / 100) - LONGRUN_INFLATION;
  const pensionAmount = penBase;
  const ltc           = plan.ltc || {};

  // ── Earmarked-asset sale (override-only; never baked into the base plan) ──────
  // ov.assetSale = { asset: <index into plan.properties>, age: <sale age> }. We
  // resolve the NET proceeds here (deterministic — no market randomness), in
  // NOMINAL dollars at the sale year, then deflate to today's dollars for the
  // real-dollar sim. Cap-gains is computed on the NOMINAL appreciation (the
  // real-world basis is historical cost, so inflation is part of the taxable
  // gain). The #5 primary-residence exclusion will subtract from the gain here.
  const capGainsRate = (plan.taxes.capitalGains * (1 + (ov.taxMult || 0))) / 100;
  const saleAsset = (ov.assetSale && ov.assetSale.age != null) ? ov.assetSale.asset : -1;
  const saleAge   = (saleAsset >= 0) ? ov.assetSale.age : null;
  let assetSale = null;
  if(saleAsset >= 0){
    const pr = (plan.properties || [])[saleAsset];
    if(pr && saleAge >= curAge){
      const k        = saleAge - curAge;                       // years from now to sale
      const f        = Math.pow(1 + LONGRUN_INFLATION, k);     // nominal/real bridge
      const apprec   = (pr.appreciation || 0);                 // real appreciation/yr (v1 default 0)
      const realPrice= Math.max(0, pr.value || 0) * Math.pow(1 + apprec, k);   // today's $ at sale
      const nomPrice = realPrice * f;                          // nominal at sale
      const commPct  = Math.max(0, Math.min(1, (pr.commissionPct == null ? 5 : pr.commissionPct) / 100));
      const nomComm  = nomPrice * commPct;
      const M        = pr.mortgage || {};
      const mStart   = (M.startAge != null ? M.startAge : curAge);
      const nomPayoff= mortgageBalanceRemaining(M.balance, M.rate || 0, M.termYears, saleAge - mStart);
      // Cost basis = entered purchasePrice. If none is entered, fall back to the
      // current value (→ zero modeled gain) rather than basis 0 (which would tax
      // the ENTIRE price as gain) — we don't invent a gain we can't substantiate.
      const basis    = (pr.purchasePrice != null && pr.purchasePrice > 0)
                         ? pr.purchasePrice : Math.max(0, pr.value || 0);
      const exclusion= Math.max(0, (ov.saleExclusion || 0));   // #5: §121 primary-residence (nominal)
      const nomGain  = Math.max(0, (nomPrice - nomComm) - basis - exclusion);
      const nomTax   = nomGain * capGainsRate;
      const nomNet   = Math.max(0, nomPrice - nomPayoff - nomComm - nomTax);
      assetSale = {
        age: saleAge, asset: saleAsset,
        netProceeds:  nomNet / f,                              // back to today's dollars
        grossReal:    realPrice,
        capGainsTax:  nomTax / f,
        commission:   nomComm / f,
        mortgagePayoff: nomPayoff / f
      };
    }
  }

  return {
    currentAge: plan.household.primary.currentAge,
    retirementAge,
    savingsAnnual,
    savingsSplit,
    horizonYears: horizon,
    accounts,  // structured account container
    portfolio: {
      eq: profile.eq, fi: profile.fi,
      label: profile.label, alloc: profile.alloc,
      weights: profile.weights
    },
    returnAdj: (ov.returnAdj || 0) / 100,
    ss: ssBenefits,   // array of { amount, startAge } in the primary's age frame
    // Other income — normalized to an array of timed streams, each carrying its
    // own real growth and taxable share (both defaulting to the legacy flat-real,
    // fully-taxed behavior). Accepts a legacy single object too.
    otherIncome: (Array.isArray(plan.income.other) ? plan.income.other
                  : (plan.income.other ? [plan.income.other] : []))
      .map(o => ({
        amount:     Math.max(0, o.amount || 0),
        startAge:   (o.startAge != null ? o.startAge : 0),
        endAge:     (o.endAge   != null ? o.endAge   : 999),
        realGrowth: (o.realGrowth || 0),
        taxablePct: (o.taxablePct == null ? 1 : Math.max(0, Math.min(1, o.taxablePct)))
      })),
    pension:        { amount: pensionAmount, startAge: penStartAge, colaReal: penColaReal },
    ltc:            { amount: Math.max(0, (ltc.amount || 0) * (1 + (ov.ltcAdj || 0))), onsetAge: (ltc.onsetAge != null ? ltc.onsetAge : 999) },
    expenses: {
      living:     plan.expenses.living     * spendMult,
      housing:    plan.expenses.housing    * spendMult,
      debt:       plan.expenses.debt       * spendMult,
      // Healthcare is NOT scaled by spendMult — it's not discretionary lifestyle
      // spending. It has its own healthcareRealGrowth rate applied in the sim loop.
      healthcare: plan.expenses.healthcare,
      // Discretionary, time-bounded extras — flex with the spending lever, flat-real.
      extra: (plan.expenses.extra || []).map(e => ({
        amount:   Math.max(0, e.amount || 0) * spendMult,
        startAge: (e.startAge != null ? e.startAge : 0),
        endAge:   (e.endAge   != null ? e.endAge   : 999)
      }))
    },
    // Recurring liabilities (e.g. a mortgage). NOT scaled by spendMult — a fixed
    // obligation isn't discretionary spending. colaReal mirrors the pension:
    // nominal escalator − inflation, so a 0%-COLA debt erodes in real terms.
    // Property mortgages are amortized to a fixed annual payment and APPENDED here
    // as ordinary fixed-nominal liabilities (payment from the loan's start age until
    // payoff = startAge + termYears), so they reuse the same tested cash-flow path.
    liabilities: [
      ...(plan.liabilities || []).map(L => ({
        amount:   Math.max(0, L.amount || 0),
        startAge: (L.startAge != null ? L.startAge : 0),
        endAge:   (L.endAge   != null ? L.endAge   : 999),
        colaReal: ((L.colaPct || 0) / 100) - LONGRUN_INFLATION
      })),
      ...(plan.properties || [])
        .map((pr, idx) => ({ pr, idx }))
        .filter(({pr}) => pr && pr.mortgage && (pr.mortgage.balance > 0) && (pr.mortgage.termYears > 0))
        .map(({pr, idx}) => {
          const M = pr.mortgage;
          const start = (M.startAge != null ? M.startAge : curAge);
          let endAge = start + M.termYears;          // payoff
          // If THIS property is sold before payoff, the mortgage is settled from
          // the proceeds. Payments stop the year BEFORE the sale (endAge = saleAge−1):
          // the remaining balance at the sale is the payoff we deduct from proceeds
          // (computed at saleAge−mStart years elapsed), so paying in the sale year too
          // would double-count that year's payment.
          if(idx === saleAsset && saleAge != null && saleAge <= endAge) endAge = saleAge - 1;
          return {
            amount:   annualMortgagePayment(M.balance, M.rate || 0, M.termYears),
            startAge: start,
            endAge,
            colaReal: -LONGRUN_INFLATION              // fixed-nominal payment erodes in real terms
          };
        })
    ],
    assetSale,   // resolved net-proceeds object, or null when no sale override
    healthcareMult: 1 + (ov.healthcareAdj || 0),
    healthcareRealGrowth: Math.max(0, plan.expenses.healthcareRealGrowth ?? 0.02),
    // Goals — normalized to an array of flat-real timed entries. A legacy
    // { vacation, property, gifts } object is converted to always-on entries.
    goals: (Array.isArray(plan.goals)
              ? plan.goals
              : Object.keys(plan.goals || {}).map(k => ({ name:k, amount:plan.goals[k], startAge:0, endAge:999 })))
      .map(g => ({
        name:     g.name || '',
        amount:   Math.max(0, g.amount || 0),
        startAge: (g.startAge != null ? g.startAge : 0),
        endAge:   (g.endAge   != null ? g.endAge   : 999)
      })),
    // Tax rates split: ordinary income (for traditional withdrawals and SS),
    // and long-term capital gains (for taxable account gains).
    // The taxMult override scales both rates proportionally for stress testing.
    taxRates: {
      ordinary:     (plan.taxes.ordinary     * (1 + (ov.taxMult || 0))) / 100,
      capitalGains: (plan.taxes.capitalGains * (1 + (ov.taxMult || 0))) / 100
    },
    // Withdrawal strategy — drives account sequencing in fundGap
    withdrawalStrategy: plan.portfolio.withdrawalStrategy || 'taxable-first',
    // One-time cash shock injected at a specific year (fragility probe).
    lumpSum:     Math.max(0, ov.lumpSum || 0),
    lumpSumYear: (ov.lumpSumYear != null ? ov.lumpSumYear : -1),
    iterations: plan.simulation.iterations
  };
}


// ── RMDs (Required Minimum Distributions) ───────────────────────────────────
// SECURE 2.0: the pre-tax (Traditional) sleeve must distribute a minimum each
// year from age 73 = prior-year-end balance ÷ the IRS Uniform Lifetime divisor
// for that age. Roth is exempt. The distribution is ordinary income; any part
// not needed for spending is reinvested (after tax) into the taxable sleeve —
// you must TAKE it, not SPEND it, so the portfolio only loses the tax.
//
// Divisors: IRS Uniform Lifetime Table (Pub 590-B, Table III), current 2026.
const RMD_START_AGE = 73;
const UNIFORM_LIFETIME = {
  73:26.5, 74:25.5, 75:24.6, 76:23.7, 77:22.9, 78:22.0, 79:21.1, 80:20.2,
  81:19.4, 82:18.5, 83:17.7, 84:16.8, 85:16.0, 86:15.2, 87:14.4, 88:13.7,
  89:12.9, 90:12.2, 91:11.5, 92:10.8, 93:10.1, 94:9.5, 95:8.9, 96:8.4,
  97:7.8, 98:7.3, 99:6.8, 100:6.4, 101:6.0, 102:5.6, 103:5.2, 104:4.9,
  105:4.6, 106:4.3, 107:4.1, 108:3.9, 109:3.7, 110:3.5, 111:3.4, 112:3.3,
  113:3.1, 114:3.0, 115:2.9, 116:2.8, 117:2.7, 118:2.5, 119:2.3, 120:2.0
};
function rmdDivisor(age){
  if(age < RMD_START_AGE) return Infinity;          // no RMD → required = 0
  return UNIFORM_LIFETIME[Math.min(age, 120)];      // table floors at 120+
}

function runSinglePath(p, returnPath){
  // Each path gets its own evolving account state — clone from inputs.
  const accounts = {
    taxable:     { balance: p.accounts.taxable.balance, basis: p.accounts.taxable.basis },
    traditional: { balance: p.accounts.traditional.balance },
    roth:        { balance: p.accounts.roth.balance }
  };

  let returnProduct = 1;
  let failed        = false;
  let lifetimeTax   = 0;  // cumulative taxes paid across all years of this path
  const rows = [];

  // Total balance across all accounts — what we report as "portfolio balance".
  const totalBalance = () => accounts.taxable.balance + accounts.traditional.balance + accounts.roth.balance;

  // Path-level risk metrics (against total portfolio balance).
  let minBalance      = totalBalance();
  let peakBalance     = totalBalance();
  let maxDrawdown     = 0;
  let depletionAge    = null;
  let first10Product  = 1;
  let balanceAt10     = 0;

  for(let y = 0; y < p.horizonYears; y++){
    const age = p.currentAge + y;
    const rp  = returnPath[y];
    const r   = ((rp && rp.proxyReturn != null) ? rp.proxyReturn : weightedAssetReturn(rp, p.portfolio.weights)) + p.returnAdj;

    // ── Earmarked-asset sale ──────────────────────────────────────────────
    // Net proceeds land in the TAXABLE sleeve as after-tax cash (basis = full
    // proceeds) at the sale age, then invest and compound from here forward —
    // works in either phase. Applied via the assetSale override only; the base
    // plan is never mutated, so the Baseline column never sees it.
    const saleProceeds = (p.assetSale && age === p.assetSale.age) ? p.assetSale.netProceeds : 0;
    if(saleProceeds > 0){
      accounts.taxable.balance += saleProceeds;
      accounts.taxable.basis   += saleProceeds;
    }

    // ── ACCUMULATION PHASE (age < retirementAge) ──────────────────────────
    // Still working: portfolio grows and receives savings; no retirement
    // spending, withdrawals, income, or tax events yet. Contributions land in
    // the traditional (pre-tax) sleeve. No-op at default (retirementAge==currentAge).
    if(age < p.retirementAge){
      returnProduct *= (1 + r);
      if(y < 10) first10Product *= (1 + r);
      const accFactor = Math.abs(r) < 1e-7 ? 12 : r / (Math.pow(1 + r, 1/12) - 1);
      const startBalanceA = totalBalance();
      // Contribution for the year (principal + partial-year growth), routed to
      // the three sleeves per savingsSplit. Default split = 100% traditional, so
      // this is byte-identical to the old single-line behavior.
      const contrib = (p.savingsAnnual / 12) * accFactor;
      accounts.taxable.balance     = accounts.taxable.balance     * (1 + r) + contrib * p.savingsSplit.taxable;
      accounts.roth.balance        = accounts.roth.balance        * (1 + r) + contrib * p.savingsSplit.roth;
      accounts.traditional.balance = accounts.traditional.balance * (1 + r) + contrib * p.savingsSplit.traditional;
      // Taxable contributions are after-tax dollars → their principal adds to basis.
      if(p.savingsSplit.taxable > 0) accounts.taxable.basis += p.savingsAnnual * p.savingsSplit.taxable;
      // One-time capital outlay (e.g. a home purchase) during working years. The
      // engine assumes salary covers recurring costs while working, but a large
      // purchase is funded by liquidating investments — taxable first, then
      // traditional, then Roth. (Simplification: principal only, no cap-gains tax
      // on the sale — small vs the outlay and consistent with the accum model.)
      const lumpA = (p.lumpSum > 0 && y === p.lumpSumYear) ? p.lumpSum : 0;
      if(lumpA > 0){
        let rem = lumpA;
        if(rem > 0 && accounts.taxable.balance > 0){
          const take = Math.min(accounts.taxable.balance, rem);
          accounts.taxable.basis *= (accounts.taxable.balance - take) / accounts.taxable.balance;
          accounts.taxable.balance -= take; rem -= take;
        }
        if(rem > 0){ const take = Math.min(accounts.traditional.balance, rem); accounts.traditional.balance -= take; rem -= take; }
        if(rem > 0){ const take = Math.min(accounts.roth.balance, rem);        accounts.roth.balance        -= take; rem -= take; }
      }
      const endBalanceA = totalBalance();
      if(y === 9) balanceAt10 = endBalanceA;
      if(endBalanceA < minBalance) minBalance = endBalanceA;
      if(endBalanceA > peakBalance) peakBalance = endBalanceA;
      if(peakBalance > 0){ const dd = (peakBalance - endBalanceA) / peakBalance; if(dd > maxDrawdown) maxDrawdown = dd; }
      rows.push({
        year: y+1, age, source: rp.y, returnRate: r, phase: 'accum',
        socialSecurity: 0, otherIncome: 0, pension: 0, withdrawal: 0, assetSale: saleProceeds,
        expenses: 0, goals: 0, liabilities: 0, taxes: 0, savings: p.savingsAnnual, lumpSum: lumpA,
        startBalance: startBalanceA, wdRate: 0,
        netCashflow: p.savingsAnnual - lumpA + saleProceeds,
        balance: endBalanceA, failed: false,
        accountBreakdown: { taxable: 0, traditional: 0, roth: 0 },
        accountBalances: { taxable: accounts.taxable.balance, traditional: accounts.traditional.balance, roth: accounts.roth.balance },
        taxBySource: { ss: 0, oi: 0, traditional: 0, taxable: 0 }
      });
      continue;
    }

    // External income (today's dollars — no COLA). SS is the sum of each
    // person's benefit that has started by this age (primary + spouse).
    let ssInc = 0;
    for(const b of p.ss){ if(age >= b.startAge) ssInc += b.amount; }
    // Each stream grows in REAL terms from its own startAge (0 = flat real,
    // negative = phases down) and contributes only its taxable share to tax.
    let oiInc = 0, oiTaxable = 0;
    for(const o of p.otherIncome){
      if(age >= o.startAge && age <= o.endAge){
        const amt = o.amount * Math.pow(1 + o.realGrowth, age - o.startAge);
        oiInc     += amt;
        oiTaxable += amt * o.taxablePct;
      }
    }
    const penInc = (p.pension && age >= p.pension.startAge)
                   ? p.pension.amount * Math.pow(1 + (p.pension.colaReal || 0), age - p.pension.startAge) : 0;
    const ltcCost = (p.ltc && age >= p.ltc.onsetAge) ? p.ltc.amount : 0;
    let extraExp = 0;
    for(const e of p.expenses.extra){ if(age >= e.startAge && age <= e.endAge) extraExp += e.amount; }
    const yearsRetired = Math.max(0, age - p.retirementAge);
    const healthcareCost = p.expenses.healthcare * p.healthcareMult
                           * Math.pow(1 + p.healthcareRealGrowth, yearsRetired);
    const expenses = p.expenses.living + p.expenses.housing + p.expenses.debt
                     + healthcareCost + extraExp + ltcCost;
    let goalsY = 0;
    for(const g of p.goals){ if(age >= g.startAge && age <= g.endAge) goalsY += g.amount; }
    // Recurring liabilities active at this age, each eroded in real terms from
    // its OWN start age (a fixed mortgage started years ago is already cheaper).
    const liabCost = p.liabilities.reduce((s, L) =>
      (age >= L.startAge && age <= L.endAge)
        ? s + L.amount * Math.pow(1 + L.colaReal, age - L.startAge)
        : s, 0);

    // Tax on external income: 85% of SS, the taxable share of OI, 100% of pension,
    // at the ordinary rate.
    const taxOnSS    = ssInc * 0.85 * p.taxRates.ordinary;
    const taxOnOI    = oiTaxable * p.taxRates.ordinary;
    const taxOnPen   = penInc * p.taxRates.ordinary;
    const taxOnInc   = taxOnSS + taxOnOI + taxOnPen;
    const netInc     = (ssInc + oiInc + penInc) - taxOnInc;

    // One-time cash shock (e.g. medical/family event) lands as extra need.
    const lumpY = (p.lumpSum > 0 && y === p.lumpSumYear) ? p.lumpSum : 0;

    // After-tax gap the portfolio must cover.
    const gap = (expenses + goalsY + liabCost + lumpY) - netInc;

    const startBalance = totalBalance();

    // Compute the withdrawal breakdown without mutating accounts.
    const funding = gap > 0
      ? fundGap(accounts, gap, p.taxRates, p.withdrawalStrategy)
      : { totalWithdrawn: 0, totalTax: 0, breakdown: { taxable: 0, traditional: 0, roth: 0 }, taxBySource: { taxable: 0, traditional: 0 }, shortfall: 0 };

    const withdrawal = funding.totalWithdrawn;
    const totalTax   = taxOnInc + funding.totalTax;
    lifetimeTax     += totalTax;
    const wdRate = (startBalance > 0.01 && withdrawal > 0)
                   ? (withdrawal / startBalance) * 100 : 0;

    returnProduct *= (1 + r);
    if(y < 10) first10Product *= (1 + r);

    // Mid-year withdrawal factor — spreads withdrawals across the year while
    // the balance is earning the annual return. Same formula as the original
    // single-account engine; we just apply it per-account now.
    const factor = Math.abs(r) < 1e-7 ? 12 : r / (Math.pow(1 + r, 1/12) - 1);

    // Capture the START-of-year values for basis math. We need these before
    // we modify the balance, because basis consumption is based on the
    // withdrawal's share of the starting balance — not the ending balance.
    const taxStartBal   = accounts.taxable.balance;
    const taxStartBasis = accounts.taxable.basis;
    // Prior-year-end pre-tax balance — the base the RMD is computed against.
    const tradStartBal  = accounts.traditional.balance;

    // Update each account's balance with mid-year math:
    //   end = start * (1+r) - (withdrawal / 12) * factor
    accounts.taxable.balance     = accounts.taxable.balance     * (1 + r) - (funding.breakdown.taxable     / 12) * factor;
    accounts.traditional.balance = accounts.traditional.balance * (1 + r) - (funding.breakdown.traditional / 12) * factor;
    accounts.roth.balance        = accounts.roth.balance        * (1 + r) - (funding.breakdown.roth        / 12) * factor;

    // Consume basis proportionally to the gross taxable withdrawal. If you
    // pull X dollars from a taxable account with starting balance B and
    // basis P, the dollars carry P/B basis with them: basis_consumed = X * P/B.
    // Basis doesn't earn returns — only the appreciation does — so timing
    // doesn't change this proportion.
    if(funding.breakdown.taxable > 0 && taxStartBal > 0.01){
      const basisFraction = taxStartBasis / taxStartBal;
      const basisConsumed = funding.breakdown.taxable * basisFraction;
      accounts.taxable.basis = Math.max(0, taxStartBasis - basisConsumed);
    }

    // ── RMD: force out any required distribution beyond what spending pulled ──
    // Spending may already have drawn from Traditional (funding.breakdown). Only
    // the shortfall to the required amount is forced. It's taxed as ordinary
    // income; the after-tax remainder moves to the taxable sleeve (reinvested,
    // already-taxed → pure basis). Net portfolio effect = just the tax.
    let rmdForced = 0, rmdTax = 0;
    if(age >= RMD_START_AGE && tradStartBal > 0.01){
      const required = tradStartBal / rmdDivisor(age);
      rmdForced = Math.max(0, required - funding.breakdown.traditional);   // beyond spending draw
      rmdForced = Math.min(rmdForced, Math.max(0, accounts.traditional.balance));
      if(rmdForced > 0.01){
        accounts.traditional.balance -= rmdForced;
        rmdTax = rmdForced * p.taxRates.ordinary;
        const reinvest = rmdForced - rmdTax;
        accounts.taxable.balance += reinvest;
        accounts.taxable.basis   += reinvest;        // after-tax dollars carry full basis
        lifetimeTax += rmdTax;
      }
    }

    // Floor any depleted accounts at zero.
    if(accounts.taxable.balance < 0)     accounts.taxable.balance = 0;
    if(accounts.traditional.balance < 0) accounts.traditional.balance = 0;
    if(accounts.roth.balance < 0)        accounts.roth.balance = 0;

    // Total depletion check — plan failed if no account can cover need.
    if(totalBalance() <= 0.01 || funding.shortfall > 0.01){
      accounts.taxable.balance = 0; accounts.taxable.basis = 0;
      accounts.traditional.balance = 0;
      accounts.roth.balance = 0;
      failed = true;
      if(depletionAge === null) depletionAge = age;
    }

    const endBalance = totalBalance();

    if(y === 9) balanceAt10 = endBalance;

    if(endBalance < minBalance) minBalance = endBalance;
    if(endBalance > peakBalance) peakBalance = endBalance;
    if(peakBalance > 0){
      const dd = (peakBalance - endBalance) / peakBalance;
      if(dd > maxDrawdown) maxDrawdown = dd;
    }

    rows.push({
      year: y+1, age, source: rp.y, returnRate: r,
      nominalReturn: (rp && rp.proxyNominalReturn != null) ? rp.proxyNominalReturn : null,
      inflationRate: (rp && rp.proxyInflationRate != null) ? rp.proxyInflationRate : null,
      realReturnUsed: r,
      socialSecurity: ssInc, otherIncome: oiInc, pension: penInc, withdrawal,
      rmd: rmdForced, assetSale: saleProceeds,
      expenses, goals: goalsY, liabilities: liabCost, taxes: totalTax + rmdTax, lumpSum: lumpY,
      startBalance, wdRate,
      netCashflow: (ssInc + oiInc + penInc + saleProceeds) - (expenses + goalsY + liabCost + totalTax + rmdTax),
      balance: endBalance, failed,
      accountBreakdown: { ...funding.breakdown },
      accountBalances: {
        taxable: accounts.taxable.balance,
        traditional: accounts.traditional.balance,
        roth: accounts.roth.balance
      },
      taxBySource: {
        ss: taxOnSS, oi: taxOnOI,
        traditional: funding.taxBySource.traditional,
        taxable: funding.taxBySource.taxable
      }
    });

    if(failed){
      for(let z = y+1; z < p.horizonYears; z++){
        rows.push({
          year:z+1, age:p.currentAge+z, source:null, returnRate:0,
          socialSecurity:0, otherIncome:0, withdrawal:0,
          expenses:0, goals:0, taxes:0,
          startBalance:0, wdRate:0, netCashflow:0, balance:0, failed:true,
          accountBreakdown: { taxable:0, traditional:0, roth:0 },
          accountBalances:  { taxable:0, traditional:0, roth:0 }
        });
      }
      break;
    }
  }

  const cagr = Math.pow(returnProduct, 1 / p.horizonYears) - 1;
  const first10Years = Math.min(10, p.horizonYears);
  const first10Cagr = first10Years > 0
    ? Math.pow(first10Product, 1 / first10Years) - 1
    : 0;
  return { rows, failed, cagr, terminalBalance: totalBalance(),
           minBalance, maxDrawdown, depletionAge, first10Cagr, balanceAt10,
           lifetimeTax };
}


function analyzeResults(sims, p){
  const ns = sims.length;
  const survived = sims.filter(s => !s.failed).length;

  // Total starting balance across all three accounts — used as the envelope
  // origin point and as the comparison baseline for "above starting" metrics.
  const startingTotal = p.accounts.taxable.balance + p.accounts.traditional.balance + p.accounts.roth.balance;

  // Year-by-year percentile envelope — computed FIRST so we can use it for
  // path centrality selection below. At each year, sort all simulation balances
  // and take percentile cuts. Note: envelope is NOT a coherent path; it's the
  // boundary of outcomes at each year.
  const horizon = p.horizonYears;
  const envelope = [{
    year: 0,
    p10: startingTotal, p25: startingTotal,
    p50: startingTotal, p75: startingTotal,
    p90: startingTotal
  }];
  for(let y = 0; y < horizon; y++){
    const bals = sims.map(s => s.rows[y] ? s.rows[y].balance : 0).sort((a,b)=>a-b);
    envelope.push({
      year: y + 1,
      p10: bals[Math.floor(ns * 0.10)],
      p25: bals[Math.floor(ns * 0.25)],
      p50: bals[Math.floor(ns * 0.50)],
      p75: bals[Math.floor(ns * 0.75)],
      p90: bals[Math.floor(ns * 0.90)]
    });
  }

  // Path selection for Stressed/Favorable: sort by balance at year 10.
  // Stressed = worst early sequence → surfaces the sequence-risk story clients need
  // to understand. Bad early returns during withdrawals are the primary retirement risk.
  // Favorable = best early sequence → shows what good early compounding looks like.
  // Terminal balance is correct for Summary distribution but wrong here — Plan Drivers
  // is specifically about sequence-of-returns risk, not final outcome ranking.
  const bySequence = sims.slice().sort((a, b) => {
    if(a.balanceAt10 !== b.balanceAt10) return a.balanceAt10 - b.balanceAt10;
    return a.terminalBalance - b.terminalBalance;
  });
  const byCagr = sims.slice().sort((a, b) => a.cagr - b.cagr);

  // Centrality score: sum of proportional deviations from year-by-year median.
  // Proportional (rather than absolute) so later high-balance years don't dominate.
  // The most central path is the one that tracks the median envelope closest.
  function centrality(sim){
    let score = 0;
    for(let y = 0; y < sim.rows.length; y++){
      const med = envelope[y + 1].p50;
      if(med > 0.01){
        score += Math.abs(sim.rows[y].balance - med) / med;
      }
    }
    return score;
  }
  const withCent = sims.map(s => ({ sim: s, c: centrality(s) }));
  withCent.sort((a, b) => a.c - b.c);
  const typicalPath = withCent[0].sim;

  const paths = {
    p10: bySequence[Math.floor(ns * 0.10)],
    p25: bySequence[Math.floor(ns * 0.25)],
    p50: typicalPath,
    p75: bySequence[Math.floor(ns * 0.75)],
    p90: bySequence[Math.floor(ns * 0.90)]
  };

  // Terminal balance distribution — independent of path selection sort.
  const terms = sims.map(s => s.terminalBalance).sort((a, b) => a - b);
  const terminal = {
    p10: terms[Math.floor(ns * 0.10)],
    p25: terms[Math.floor(ns * 0.25)],
    p50: terms[Math.floor(ns * 0.50)],
    p75: terms[Math.floor(ns * 0.75)],
    p90: terms[Math.floor(ns * 0.90)]
  };

  // Aggregate risk metrics.
  const failedSims    = sims.filter(s => s.failed);
  const survivorSims  = sims.filter(s => !s.failed);

  // Depletion age — already scoped to failed paths.
  const deplAges = failedSims.map(s => s.depletionAge).filter(a => a !== null).sort((a,b)=>a-b);
  const medianDepletionAge = deplAges.length > 0
    ? deplAges[Math.floor(deplAges.length / 2)]
    : null;

  // Min balance and max drawdown — scoped to SURVIVORS only.
  // Including failed paths makes these metrics collapse to $0 / 100% on stressed
  // plans, which is uninformative (a failed path always hits zero by definition).
  // Among survivors, these answer "of the plans that worked, how close did
  // they come to failure?" — a real sequence-risk signal.
  const sMinBals = survivorSims.map(s => s.minBalance).sort((a,b)=>a-b);
  const medianMinBalanceSurvivors = sMinBals.length > 0
    ? sMinBals[Math.floor(sMinBals.length / 2)]
    : null;

  const sDDs = survivorSims.map(s => s.maxDrawdown).sort((a,b)=>a-b);
  const medianMaxDrawdownSurvivors = sDDs.length > 0
    ? sDDs[Math.floor(sDDs.length / 2)]
    : null;

  // Worst overall drawdown across all paths (not just survivors). Useful even
  // when failures exist because it indicates how steep the worst case got.
  const worstMaxDrawdown = sims.reduce((m, s) => s.maxDrawdown > m ? s.maxDrawdown : m, -Infinity);

  const worstFirst10Cagr = sims.reduce((m, s) => s.first10Cagr < m ? s.first10Cagr : m, Infinity);

  // Years underwater — median count of years a path's balance sits below its
  // starting (real) capital. A direct sequence-risk read: how long the plan
  // spends in a hole. Failed-path filler rows (balance 0) count as underwater.
  const uwCounts = sims.map(s => s.rows.filter(r => r.balance < startingTotal - 0.01).length).sort((a,b)=>a-b);
  const medianYearsUnderwater = uwCounts.length ? uwCounts[Math.floor(uwCounts.length / 2)] : 0;

  // Derived probability counts — power the connective-tissue text strip.
  const aboveStartCount   = sims.filter(s => s.terminalBalance > startingTotal).length;
  const doubledCount      = sims.filter(s => s.terminalBalance > 2 * startingTotal).length;
  const bigDrawdownCount  = sims.filter(s => s.maxDrawdown > 0.40).length;

  const taxAmounts = sims.map(s => s.lifetimeTax).sort((a,b) => a - b);
  const medianLifetimeTax = taxAmounts[Math.floor(ns * 0.50)];

  return {
    paths, terminal, envelope,
    sims,
    successRate: (survived / ns) * 100,
    survived, total: ns,
    medianCagr: byCagr[Math.floor(ns * 0.50)].cagr,
    horizonYears: p.horizonYears,
    iterations: ns,
    params: p,
    medianLifetimeTax,
    metrics: {
      medianDepletionAge,
      medianMinBalanceSurvivors,
      medianMaxDrawdownSurvivors,
      medianYearsUnderwater,
      worstMaxDrawdown,
      worstFirst10Cagr,
      aboveStartCount,
      doubledCount,
      bigDrawdownCount
    }
  };
}


function runHistoricalPath(plan, startYear, strategy, transform, overrides){
  // `overrides` flows through the SAME resolveInputs lever mapping the Monte
  // Carlo path uses (retireDelay, ssDelayYears, spendBump, lumpSum, savingsBump,
  // pensionStartAge, …) so a chosen scenario is sequenced faithfully, not just
  // its allocation. Defaults to {} → behavior identical to the original.
  const rawInputs = resolveInputs(plan, overrides || {});
  // Override strategy for this run
  rawInputs.withdrawalStrategy = strategy;

  // Build the path from startYear forward. When we reach the end of the real
  // record (2025) we WRAP back to its start rather than truncate — the same
  // cyclic treatment the block-bootstrap Monte Carlo uses, so a recent
  // retirement year (2000, 2008) still gets a FULL real-return horizon instead
  // of a stub that ends mid-retirement. Every return remains a real historical
  // year; only the calendar contiguity breaks at the wrap (invisible on an
  // age-based axis). The first decade — where sequence risk lives — is always
  // pre-wrap and fully real.
  const startIdx = RETURN_DATA.findIndex(r => r.y === startYear);
  if(startIdx < 0) return null;
  const path = [];
  for(let i = 0; i < rawInputs.horizonYears; i++){
    const row = RETURN_DATA[(startIdx + i) % RETURN_DATA.length];
    const proxy = historicalProxyComponents(row, plan.portfolio.riskProfile);
    path.push({
      ...row,
      proxyReturn: proxy.real,
      proxyNominalReturn: proxy.nominal,
      proxyInflationRate: proxy.inflation,
      proxyStockNominal: proxy.stockNominal,
      proxyBondNominal: proxy.bondNominal
    });
  }
  if(path.length === 0) return null;

  // Optional ORDER transform (e.g. reverse): reorders the SAME real return
  // rows before the single-path runner walks them. The returns are unchanged —
  // only their sequence is. Used by the Sequencing tab to isolate order. When
  // omitted, behavior is byte-identical to the original forward run.
  const ordered = typeof transform === 'function' ? transform(path.slice()) : path;

  // Adjust horizon to actual data available
  const inputs = { ...rawInputs, horizonYears: ordered.length };
  const result = runSinglePath(inputs, ordered);
  result.actualYears  = ordered.length;
  result.requestedYrs = rawInputs.horizonYears;
  result.startYear    = startYear;
  result.endYear      = startYear + ordered.length - 1;
  return result;
}

/* ---- exports (so the UI and tests import instead of sharing globals) ---- */
export {
  RETURN_DATA, ASSET_META, ASSET_KEYS, EQUITY_MIX, DEFENSIVE_MIX,
  RISK_PROFILES, ASSET_STATS, LONGRUN_INFLATION,
  buildAssetWeights, computeAssetStats, generateReturnPath, resetSeed, weightedAssetReturn,
  runSimulation, resolveInputs, runSinglePath, analyzeResults, runHistoricalPath,
  annualMortgagePayment,
  plan as defaultPlan
};
