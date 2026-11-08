// Ported from cryppit/shield-receipt src/tx.ts (MIT, Cryppit) by stripping its TypeScript types; logic unchanged.
// The facts about one transaction that decide where a withdrawal landed, read from Blockchair's raw transaction
// (Zebra's decoded transaction: transparent outputs and the Sapling, Orchard and Ironwood bundles) and its dashboard
// entry (block height and time). A value balance below zero means value entered that shielded pool.

                                                      

                           
             
                                                               
                  
                          
                                                                                        
                          
 

                                                                                                    

                          
               
                                                      
                        
                                              
                      
                      
                    
                                                                                                
                           
                  
                    
 

                                   
const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (typeof v === "number" ? v : 0);

const KNOWN_KEYS = new Set(["txid", "authdigest", "size", "overwintered", "version", "versiongroupid", "locktime", "expiryheight", "hex", "vin", "vout", "vjoinsplit", "valueBalance", "valueBalanceZat", "vShieldedSpend", "vShieldedOutput", "orchard", "ironwood"]);

function entry(response, txid) {
  if (!isObj(response) || !isObj(response.data)) return null;
  const e = response.data[txid];
  return isObj(e) ? e : null;
}

function actionPool(pool, b) {
  if (!isObj(b)) return null;
  const actions = list(b.actions).length;
  const valueBalanceZat = num(b.valueBalanceZat);
  if (actions === 0 && valueBalanceZat === 0) return null;
  const outputsEnabled = !isObj(b.flags) || b.flags.enableOutputs !== false;
  return { pool, actions, valueBalanceZat, outputsEnabled };
}

/** `undecoded`: Blockchair has the transaction but no decoded form of it (for example a new format after an upgrade). */
export function readBlockchairTx(raw, dashboard, txid) {
  const r = entry(raw, txid);
  if (!r) return { notFound: true };
  const t = isObj(r.decoded_raw_transaction) ? r.decoded_raw_transaction : null;
  if (!t) return { undecoded: true };
  const d = entry(dashboard, txid);
  const info = d && isObj(d.transaction) ? d.transaction : {};

  const blockId = num(info.block_id);
  const height = blockId > 0 ? blockId : null;
  const time = height !== null && typeof info.time === "string" ? `${info.time.replace(" ", "T")}Z` : null;

  const outputs = list(t.vout).filter(isObj).map((o) => {
    const spk = isObj(o.scriptPubKey) ? o.scriptPubKey : {};
    const addresses = list(spk.addresses);
    return {
      n: num(o.n),
      scriptHex: typeof spk.hex === "string" ? spk.hex.toLowerCase() : "",
      valueZat: num(o.valueZat),
      address: typeof addresses[0] === "string" ? addresses[0] : null,
    };
  });

  const pools = [];
  const saplingActions = list(t.vShieldedSpend).length + list(t.vShieldedOutput).length;
  const saplingBalance = num(t.valueBalanceZat);
  if (saplingActions > 0 || saplingBalance !== 0) {
    pools.push({ pool: "sapling", actions: saplingActions, valueBalanceZat: saplingBalance, outputsEnabled: list(t.vShieldedOutput).length > 0 });
  }
  for (const p of [actionPool("orchard", t.orchard), actionPool("ironwood", t.ironwood)]) if (p) pools.push(p);

  const unknownBundles = Object.keys(t).filter((k) => {
    const v = t[k];
    return !KNOWN_KEYS.has(k) && isObj(v) && ("actions" in v || "valueBalanceZat" in v);
  });

  return {
    txid,
    height,
    time,
    outputs,
    pools,
    unknownBundles,
    sprout: list(t.vjoinsplit).length > 0,
    coinbase: info.is_coinbase === true || list(t.vin).some((v) => isObj(v) && "coinbase" in v),
  };
}
