pub fn normalize_catalog_key(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut previous_separator = false;
    for character in value.trim().to_lowercase().chars() {
        if character.is_ascii_alphanumeric() {
            output.push(character);
            previous_separator = false;
            continue;
        }
        if !previous_separator {
            output.push('_');
            previous_separator = true;
        }
    }
    output.trim_matches('_').to_string()
}

#[cfg(test)]
mod tests {
    use super::normalize_catalog_key;

    #[test]
    fn normalizes_case_spacing_and_punctuation() {
        assert_eq!(normalize_catalog_key("  Barbell Squat  "), "barbell_squat");
        assert_eq!(
            normalize_catalog_key("Rear-Deltoid Fly"),
            "rear_deltoid_fly"
        );
        assert_eq!(normalize_catalog_key("Leg/Press (45°)"), "leg_press_45");
        assert_eq!(normalize_catalog_key("___"), "");
    }
}
