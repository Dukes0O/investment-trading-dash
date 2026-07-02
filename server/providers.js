// Market-data provider fetchers (moved from the browser: keys stay
// server-side and there is no CORS constraint). Node 18+ global fetch.

export async function fetchAlphaVantage(symbol, apiKey) {
  const url =
    'https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&outputsize=full' +
    `&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
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

export async function fetchTwelveData(symbol, apiKey) {
  const url =
    'https://api.twelvedata.com/time_series?interval=1day&outputsize=600' +
    `&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
  const json = await res.json();
  if (json.status === 'error') throw new Error(`Twelve Data: ${json.message || 'request failed'}`);
  if (!json.values) throw new Error('Twelve Data: unexpected response shape');
  return json.values
    .map((v) => ({
      date: v.datetime.slice(0, 10),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: v.volume != null ? parseFloat(v.volume) : 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
