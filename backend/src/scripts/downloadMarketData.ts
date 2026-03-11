import axios from 'axios';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';

const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'];
const yearMonth = '2024-01';

async function downloadAndUnzip() {
    const marketDir = path.join(__dirname, '../../src/data/market');
    if (!fs.existsSync(marketDir)) {
        fs.mkdirSync(marketDir, { recursive: true });
    }

    for (const symbol of symbols) {
        console.log(`Downloading ${symbol}...`);
        const url = `https://data.binance.vision/data/spot/monthly/klines/${symbol}/1m/${symbol}-1m-${yearMonth}.zip`;
        const zipPath = path.join(marketDir, `${symbol}-1m-${yearMonth}.zip`);

        try {
            // Download as stream to avoid loading huge file into memory, but axios with responseType arraybuffer is fine here (around 20MB)
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            fs.writeFileSync(zipPath, response.data);

            const zip = new AdmZip(zipPath);
            zip.extractAllTo(marketDir, true);

            // Calculate number of lines extracted
            const csvPath = path.join(marketDir, `${symbol}-1m-${yearMonth}.csv`);
            if (fs.existsSync(csvPath)) {
                const content = fs.readFileSync(csvPath, 'utf-8');
                const lineCount = content.split('\n').filter(l => l.trim().length > 0).length;
                console.log(`Downloaded and extracted ${symbol} (${lineCount} candles)`);
            }

            // Cleanup zip
            fs.unlinkSync(zipPath);
        } catch (error) {
            console.error(`Failed to download or extract ${symbol}:`, error);
        }
    }
}

downloadAndUnzip().catch(console.error);
