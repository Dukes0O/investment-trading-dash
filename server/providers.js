// Market-data provider fetchers (moved from the browser: keys stay
// server-side and there is no CORS constraint). Node 18+ global fetch.

export async function fetchAlphaVantage(symbol, apiKey) {
  const alphaSymbol = parseAlphaVantageSymbol(symbol);
  const url =
    // `compact` is the free-tier-compatible response size. Full history is
    // premium on Alpha Vantage; Twelve Data is the supported deep-history
    // provider for this app.
    'https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&outputsize=compact' +
    `&symbol=${encodeURIComponent(alphaSymbol)}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);
  const json = await res.json();
  if (json['Error Message']) throw new Error(`Alpha Vantage: unknown symbol ${symbol}`);
  if (json['Note'] || json['Information']) {
    throw new Error('Alpha Vantage rate limit reached (free tier: 25 requests/day). Cached data will be used where available.');
  }
  const series = json['Time Series (Daily)'];
  if (!series) throw new Error('Alpha Vantage: unexpected response shape');
  const bars = Object.entries(series)
    .map(([date, v]) => ({
      date,
      open: parseFloat(v['1. open']),
      high: parseFloat(v['2. high']),
      low: parseFloat(v['3. low']),
      close: parseFloat(v['4. close']),
      volume: parseFloat(v['5. volume']),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return bars.slice(-600);
}

// Alpha Vantage names Toronto Stock Exchange listings with the `.TRT`
// suffix. The app keeps `BMO:TSX`-style symbols so the exchange is explicit
// in the portfolio and can be routed to the right provider.
export function parseAlphaVantageSymbol(symbol) {
  const value = String(symbol);
  const split = value.split(':');
  return split.length === 2 && split[1] === 'TSX' ? `${split[0]}.TRT` : value;
}

// Twelve Data's documented maximum outputsize is 5,000 records. That gives
// the Strategy Lab enough daily history to warm up its longest indicators and
// avoids the ~2.4-year ceiling of the old 600-bar fetch.
export function parseTwelveDataSymbol(symbol) {
  const split = String(symbol).split(':');
  return split.length === 2
    ? { symbol: split[0], exchange: split[1] }
    : { symbol: String(symbol), exchange: null };
}

export async function fetchTwelveData(symbol, apiKey, { outputsize = 5000 } = {}) {
  const parsed = parseTwelveDataSymbol(symbol);
  const params = new URLSearchParams({
    interval: '1day',
    outputsize: String(outputsize),
    symbol: parsed.symbol,
    apikey: apiKey,
  });
  if (parsed.exchange) params.set('exchange', parsed.exchange);
  const url = `https://api.twelvedata.com/time_series?${params}`;
  const res = await fetch(url);
  let json;
  try {
    json = await res.json();
  } catch {
    if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
    throw new Error('Twelve Data returned an invalid JSON response.');
  }
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}: ${json?.message || 'request failed'}`);
  return parseTwelveDataJson(json, symbol);
}

// Exported separately so the response contract is unit-testable without
// network access and malformed provider responses cannot become NaN bars.
export function parseTwelveDataJson(json, symbol) {
  if (json?.status === 'error') {
    throw new Error(`Twelve Data: ${json.message || 'request failed'}`);
  }
  if (!Array.isArray(json?.values)) {
    throw new Error(`Twelve Data: unexpected response shape for ${symbol}`);
  }

  const bars = json.values.flatMap((v) => {
    const date = String(v?.datetime ?? '').slice(0, 10);
    const open = Number(v?.open);
    const high = Number(v?.high);
    const low = Number(v?.low);
    const close = Number(v?.close);
    const volume = v?.volume == null || v.volume === '' ? 0 : Number(v.volume);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || ![open, high, low, close, volume].every(Number.isFinite)) {
      return [];
    }
    return [{ date, open, high, low, close, volume }];
  });

  if (!bars.length) throw new Error(`Twelve Data: no parseable rows for ${symbol}`);
  bars.sort((a, b) => (a.date < b.date ? -1 : 1));
  return bars;
}
