// Bad Rust code: AI assistant silences errors using .unwrap() and .expect() in production logic
use std::fs::File;
use std::io::Read;

pub fn read_user_config(path: &str) -> String {
    let mut file = File::open(path).unwrap();
    let mut contents = String::new();
    file.read_to_string(&mut contents).expect("failed to read file");
    contents
}
