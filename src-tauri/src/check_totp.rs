use std::time::{SystemTime, UNIX_EPOCH};
use hmac::{Hmac, Mac};
use sha1::Sha1;
use data_encoding::BASE32_NOPAD;

type HmacSha1 = Hmac<Sha1>;

fn main() {
    let secret = "JBSWY3DPEHPK3PXP";
    let cleaned = secret.replace([' ', '-', '\n', '\r', '='], "").to_uppercase();
    
    let mut secret_bytes = BASE32_NOPAD.decode(cleaned.as_bytes()).unwrap();
    
    let current_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
        
    let period = 30;
    let time_step = current_time / period;
    let time_bytes = time_step.to_be_bytes();
    
    let mut mac = HmacSha1::new_from_slice(&secret_bytes).unwrap();
    mac.update(&time_bytes);
    let result = mac.finalize();
    let hs = result.into_bytes();
    
    let offset = (hs[19] & 0x0F) as usize;
    let binary_code = ((hs[offset] as u32 & 0x7F) << 24)
        | ((hs[offset + 1] as u32 & 0xFF) << 16)
        | ((hs[offset + 2] as u32 & 0xFF) << 8)
        | (hs[offset + 3] as u32 & 0xFF);
        
    let digits = 6;
    let modulus = 10_u32.pow(digits);
    let totp = binary_code % modulus;
    
    let code = format!("{:0width$}", totp, width = digits as usize);
    println!("{}", code);
}
