import asyncio, os, certifi
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    import codecs
    # load env
    try:
        with codecs.open('.env', 'r', encoding='utf-8') as f:
            for line in f:
                if '=' in line:
                    k, v = line.strip().split('=', 1)
                    os.environ[k.strip()] = v.strip()
    except: pass
    try:
        with codecs.open('../backend/.env', 'r', encoding='utf-16le') as f:
            for line in f:
                if '=' in line:
                    k, v = line.strip().split('=', 1)
                    os.environ[k.strip()] = v.strip()
    except: pass
    
    from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")
    uri = os.getenv("MONGODB_URI")
    if not uri:
        raise RuntimeError("MONGODB_URI not set")
    client = AsyncIOMotorClient(uri, tlsCAFile=certifi.where())
    db = client['fillscore']

    print('=== A. ONE FULL TRADE DOCUMENT ===')
    doc = await db.trades.find_one({'userId': 'demo-aggressive', 'symbol': 'BTCUSDT'})
    print('Raw keys/values:', doc)
    
    fields = ['fee', 'feePaid', 'notional', 'notionalValue', 'slippageBps', 'side', 'type', 'executedAt', 'orderType', 'arrivalSlippageBps']
    for f in fields:
        val = doc.get(f)
        missing = 'MISSING/NONE' if val is None else ''
        print(f'{f}: {val} ({type(val)}) {missing}')

    print('\n=== B. FIELD POPULATION + SUMS ===')
    total = await db.trades.count_documents({'userId': 'demo-aggressive', 'symbol': 'BTCUSDT'})
    print(f'total trade count: {total}')
    
    pipeline = [
        {'$match': {'userId': 'demo-aggressive', 'symbol': 'BTCUSDT'}},
        {'$group': {
            '_id': None,
            'fee_sum': {'$sum': {'$ifNull': ['$fee', 0]}},
            'feePaid_sum': {'$sum': {'$ifNull': ['$feePaid', 0]}},
            'notional_sum': {'$sum': {'$ifNull': ['$notional', 0]}},
            'notionalValue_sum': {'$sum': {'$ifNull': ['$notionalValue', 0]}},
            
            'fee_null': {'$sum': {'$cond': [{'$eq': [{'$type': '$fee'}, 'missing']}, 1, {'$cond': [{'$eq': ['$fee', None]}, 1, 0]}]}},
            'feePaid_null': {'$sum': {'$cond': [{'$eq': [{'$type': '$feePaid'}, 'missing']}, 1, {'$cond': [{'$eq': ['$feePaid', None]}, 1, 0]}]}},
            'notional_null': {'$sum': {'$cond': [{'$eq': [{'$type': '$notional'}, 'missing']}, 1, {'$cond': [{'$eq': ['$notional', None]}, 1, 0]}]}},
            'notionalValue_null': {'$sum': {'$cond': [{'$eq': [{'$type': '$notionalValue'}, 'missing']}, 1, {'$cond': [{'$eq': ['$notionalValue', None]}, 1, 0]}]}},
        }}
    ]
    res = await db.trades.aggregate(pipeline).to_list(1)
    if res:
        r = res[0]
        print(f"count where fee is null/missing: {r['fee_null']}, and SUM(fee): {r['fee_sum']}")
        print(f"count where feePaid is null/missing: {r['feePaid_null']}, and SUM(feePaid): {r['feePaid_sum']}")
        print(f"count where notional is null/missing: {r['notional_null']}, and SUM(notional): {r['notional_sum']}")
        print(f"count where notionalValue is null/missing: {r['notionalValue_null']}, and SUM(notionalValue): {r['notionalValue_sum']}")

asyncio.run(main())
