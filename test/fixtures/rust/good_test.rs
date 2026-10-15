// Good Rust code: .unwrap() is perfectly legitimate and expected inside unit tests!
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculation() {
        let result = Some(42);
        assert_eq!(result.unwrap(), 42);
    }
}
