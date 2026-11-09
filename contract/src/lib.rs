//! Cryppit Pin v2 for Where's My ZEC.
//!
//! Once a UTC day is over, the day's Merkle root over the site's published data tables (`data/*.json`) can be pinned
//! here, so anyone can later prove what the page told people that day. The rules are v1's (intent-sentinel's anchor):
//! append-only, one pin per closed UTC day, days only move forward, each pin names the day pinned before it, only the
//! contract account itself may pin, and no deposit is taken. No owner, no admin, no upgrade path, no funds held.

use near_sdk::serde_json::json;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, PanicOnDefault};

/// Nanoseconds in a UTC day. NEAR's block timestamp counts non-leap nanoseconds since 1970-01-01T00:00Z, so a block's
/// UTC day number is `block_timestamp / NS_PER_DAY`.
const NS_PER_DAY: u64 = 86_400_000_000_000;
const EVENT_STANDARD: &str = "cryppit_pin";
const EVENT_VERSION: &str = "2.0.0";

/// A label of 1-64 characters from `a-z 0-9 @ / . _ -`.
fn valid_schema(s: &str) -> bool {
    (1..=64).contains(&s.len()) && s.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b"@/._-".contains(&c))
}

/// 64 lowercase hex characters, the form of a sha256.
fn is_hash_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

/// Days since 1970-01-01 of a `YYYY-MM-DD` naming a real Gregorian date (leap years included); `None` otherwise.
/// Howard Hinnant's days_from_civil, the same arithmetic as v1.
fn day_number(day: &str) -> Option<i64> {
    let b = day.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let num = |r: core::ops::Range<usize>| -> Option<i64> {
        b[r].iter().try_fold(0i64, |acc, &c| c.is_ascii_digit().then(|| acc * 10 + i64::from(c - b'0')))
    };
    let (y, m, d) = (num(0..4)?, num(5..7)?, num(8..10)?);
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let days_in_month = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return None,
    };
    if !(1..=days_in_month).contains(&d) {
        return None;
    }
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146_097 + doe - 719_468)
}

/// One pin: what the caller sent plus when NEAR recorded it.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Pin {
    pub day: String,
    pub merkle_root: String,
    pub leaf_count: u64,
    pub prev_pin: Option<String>,
    pub block_height: u64,
    /// Nanoseconds as a decimal string: too big for a JSON number to hold safely.
    pub block_timestamp_ns: String,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    schema: String,
    last_day: Option<String>,
    pins: LookupMap<String, Pin>,
}

#[near]
impl Contract {
    /// One-time setup. `schema` says what the pinned roots are over, e.g. `wheres-my-zec/data@1`.
    #[init]
    pub fn new(schema: String) -> Self {
        require!(valid_schema(&schema), "schema must be 1-64 characters of a-z 0-9 @ / . _ -");
        Self { schema, last_day: None, pins: LookupMap::new(b"p") }
    }

    /// Pin a closed UTC day's Merkle root. Only the contract account itself may call it, with no deposit.
    pub fn pin(&mut self, day: String, merkle_root: String, leaf_count: u64, prev_pin: Option<String>) -> Pin {
        require!(env::predecessor_account_id() == env::current_account_id(), "only the pin account itself may pin");
        require!(env::attached_deposit().is_zero(), "pin takes no deposit");
        let day_no = day_number(&day).unwrap_or_else(|| env::panic_str("day must be a real YYYY-MM-DD date"));
        // A pinned future day would block every real pin until that date, forever once the account is locked.
        // The block day is at most u64::MAX / NS_PER_DAY = 213,503, so the cast is lossless.
        require!(day_no < (env::block_timestamp() / NS_PER_DAY) as i64, "pin closed UTC days only");
        require!(is_hash_hex(&merkle_root), "merkle_root must be 64 lowercase hex characters");
        require!(leaf_count >= 1, "leaf_count must be at least 1");
        if let Some(last) = &self.last_day {
            require!(day.as_str() > last.as_str(), "days only move forward");
        }
        require!(prev_pin == self.last_day, "prev_pin must name the last pinned day");
        let record = Pin {
            day: day.clone(),
            merkle_root,
            leaf_count,
            prev_pin,
            block_height: env::block_height(),
            block_timestamp_ns: env::block_timestamp().to_string(),
        };
        self.pins.insert(day.clone(), record.clone());
        self.last_day = Some(day);
        let event = json!({ "standard": EVENT_STANDARD, "version": EVENT_VERSION, "event": "pin", "data": [record] });
        env::log_str(&format!("EVENT_JSON:{event}"));
        record
    }

    /// The pin of `day`, or `null`.
    pub fn get_pin(&self, day: String) -> Option<Pin> {
        self.pins.get(&day).cloned()
    }

    /// The most recent pin, or `null` before the first.
    pub fn last_pin(&self) -> Option<Pin> {
        self.last_day.as_ref().and_then(|d| self.pins.get(d).cloned())
    }

    /// What the pinned roots are over.
    pub fn schema(&self) -> String {
        self.schema.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_logs, VMContextBuilder};
    use near_sdk::{testing_env, AccountId, NearToken};

    const PIN_ACCOUNT: &str = "wmz-pin.cryppit.testnet";
    const DAY_NS: u64 = 86_400_000_000_000;
    // 2026-11-12T00:00:00Z: day 20,769 since 1970-01-01, so 2026-11-10 and 2026-11-11 are over, 2026-11-12 is not.
    const NOV_12: u64 = 20_769 * DAY_NS;
    const ROOT_A: &str = "4f5c2b2a3d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8";
    const ROOT_B: &str = "0000000000000000000000000000000000000000000000000000000000000001";

    fn ctx(caller: &str, now_ns: u64, deposit: u128) {
        let mut b = VMContextBuilder::new();
        b.current_account_id(PIN_ACCOUNT.parse::<AccountId>().unwrap())
            .predecessor_account_id(caller.parse::<AccountId>().unwrap())
            .signer_account_id(caller.parse::<AccountId>().unwrap())
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_timestamp(now_ns)
            .block_height(1_000);
        testing_env!(b.build());
    }

    fn contract() -> Contract {
        ctx(PIN_ACCOUNT, NOV_12, 0);
        Contract::new("wheres-my-zec/data@1".to_string())
    }

    #[test]
    fn new_sets_the_schema_once_and_starts_empty() {
        let c = contract();
        assert_eq!(c.schema(), "wheres-my-zec/data@1");
        assert_eq!(c.last_pin(), None);
        assert_eq!(c.get_pin("2026-11-10".into()), None);
    }

    #[test]
    #[should_panic(expected = "schema must be 1-64 characters")]
    fn new_rejects_an_empty_schema() {
        ctx(PIN_ACCOUNT, NOV_12, 0);
        Contract::new(String::new());
    }

    #[test]
    #[should_panic(expected = "schema must be 1-64 characters")]
    fn new_rejects_a_schema_with_odd_characters() {
        ctx(PIN_ACCOUNT, NOV_12, 0);
        Contract::new("Where's My ZEC".to_string());
    }

    #[test]
    fn pins_chain_forward_and_record_when_near_saw_them() {
        let mut c = contract();
        let p = c.pin("2026-11-10".into(), ROOT_A.into(), 2, None);
        assert_eq!(p.prev_pin, None);
        assert_eq!(p.block_height, 1_000);
        assert_eq!(p.block_timestamp_ns, NOV_12.to_string());
        let q = c.pin("2026-11-11".into(), ROOT_B.into(), 3, Some("2026-11-10".into()));
        assert_eq!(q.prev_pin.as_deref(), Some("2026-11-10"));
        assert_eq!(c.last_pin(), Some(q.clone()));
        assert_eq!(c.get_pin("2026-11-10".into()), Some(p));
    }

    #[test]
    fn a_skipped_day_stays_visible_in_prev_pin() {
        ctx(PIN_ACCOUNT, NOV_12 + 2 * DAY_NS, 0);
        let mut c = Contract::new("wheres-my-zec/data@1".into());
        c.pin("2026-11-10".into(), ROOT_A.into(), 2, None);
        let q = c.pin("2026-11-13".into(), ROOT_B.into(), 2, Some("2026-11-10".into()));
        assert_eq!(q.prev_pin.as_deref(), Some("2026-11-10"));
        assert_eq!(c.get_pin("2026-11-11".into()), None);
    }

    #[test]
    #[should_panic(expected = "days only move forward")]
    fn a_day_is_pinned_once() {
        let mut c = contract();
        c.pin("2026-11-10".into(), ROOT_A.into(), 2, None);
        c.pin("2026-11-10".into(), ROOT_B.into(), 2, Some("2026-11-10".into()));
    }

    #[test]
    #[should_panic(expected = "days only move forward")]
    fn an_earlier_day_is_refused() {
        let mut c = contract();
        c.pin("2026-11-11".into(), ROOT_A.into(), 2, None);
        c.pin("2026-11-10".into(), ROOT_B.into(), 2, Some("2026-11-11".into()));
    }

    #[test]
    #[should_panic(expected = "pin closed UTC days only")]
    fn today_is_not_over_yet() {
        let mut c = contract();
        c.pin("2026-11-12".into(), ROOT_A.into(), 2, None);
    }

    #[test]
    #[should_panic(expected = "pin closed UTC days only")]
    fn a_future_day_is_refused() {
        let mut c = contract();
        c.pin("2027-11-10".into(), ROOT_A.into(), 2, None);
    }

    #[test]
    fn a_day_is_over_from_the_first_nanosecond_of_the_next_day() {
        ctx(PIN_ACCOUNT, NOV_12, 0);
        let mut c = Contract::new("wheres-my-zec/data@1".into());
        assert_eq!(c.pin("2026-11-11".into(), ROOT_A.into(), 1, None).day, "2026-11-11");
    }

    #[test]
    #[should_panic(expected = "prev_pin must name the last pinned day")]
    fn prev_pin_must_name_the_last_pinned_day() {
        let mut c = contract();
        c.pin("2026-11-10".into(), ROOT_A.into(), 2, None);
        c.pin("2026-11-11".into(), ROOT_B.into(), 2, None);
    }

    #[test]
    #[should_panic(expected = "prev_pin must name the last pinned day")]
    fn the_first_pin_has_no_prev_pin() {
        let mut c = contract();
        c.pin("2026-11-10".into(), ROOT_A.into(), 2, Some("2026-11-09".into()));
    }

    #[test]
    #[should_panic(expected = "only the pin account itself may pin")]
    fn only_the_pin_account_itself_may_pin() {
        let mut c = contract();
        ctx("someone.testnet", NOV_12, 0);
        c.pin("2026-11-10".into(), ROOT_A.into(), 2, None);
    }

    #[test]
    #[should_panic(expected = "pin takes no deposit")]
    fn pin_takes_no_deposit() {
        let mut c = contract();
        ctx(PIN_ACCOUNT, NOV_12, 1);
        c.pin("2026-11-10".into(), ROOT_A.into(), 2, None);
    }

    #[test]
    #[should_panic(expected = "day must be a real YYYY-MM-DD date")]
    fn a_day_that_does_not_exist_is_refused() {
        let mut c = contract();
        c.pin("2026-02-30".into(), ROOT_A.into(), 2, None);
    }

    #[test]
    #[should_panic(expected = "merkle_root must be 64 lowercase hex characters")]
    fn an_uppercase_root_is_refused() {
        let mut c = contract();
        c.pin("2026-11-10".into(), ROOT_A.to_uppercase(), 2, None);
    }

    #[test]
    #[should_panic(expected = "merkle_root must be 64 lowercase hex characters")]
    fn a_short_root_is_refused() {
        let mut c = contract();
        c.pin("2026-11-10".into(), "abc".into(), 2, None);
    }

    #[test]
    #[should_panic(expected = "leaf_count must be at least 1")]
    fn zero_files_is_refused() {
        let mut c = contract();
        c.pin("2026-11-10".into(), ROOT_A.into(), 0, None);
    }

    #[test]
    fn a_pin_emits_a_nep297_event() {
        let mut c = contract();
        c.pin("2026-11-10".into(), ROOT_A.into(), 2, None);
        let logs = get_logs();
        assert_eq!(logs.len(), 1);
        let json = logs[0].strip_prefix("EVENT_JSON:").expect("NEP-297 prefix");
        let v: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(json).unwrap();
        assert_eq!(v["standard"], "cryppit_pin");
        assert_eq!(v["version"], "2.0.0");
        assert_eq!(v["event"], "pin");
        assert_eq!(v["data"][0]["day"], "2026-11-10");
        assert_eq!(v["data"][0]["merkle_root"], ROOT_A);
    }

    #[test]
    fn get_pin_of_a_malformed_day_is_none() {
        let c = contract();
        assert_eq!(c.get_pin("not-a-day".into()), None);
    }

    #[test]
    fn leap_days_are_real_days() {
        ctx(PIN_ACCOUNT, NOV_12 + 1_000 * DAY_NS, 0);
        let mut c = Contract::new("wheres-my-zec/data@1".into());
        assert_eq!(c.pin("2028-02-29".into(), ROOT_A.into(), 1, None).day, "2028-02-29");
    }
}
