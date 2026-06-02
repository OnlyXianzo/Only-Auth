use totp_rs::{Secret, TOTP, Algorithm};

fn main() {
    let _secret = Secret::generate_secret();
    let _encoded = _secret.to_encoded().to_string();
    
    let totp = TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        vec![1,2,3],
        None,
        "".to_string(),
    ).unwrap();
    println!("{}", totp.generate(59));
}
