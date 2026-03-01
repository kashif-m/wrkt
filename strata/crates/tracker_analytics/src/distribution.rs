use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DistributionItem {
    pub label: String,
    pub value: f32,
    pub percentage: f32,
}

pub struct Distribution;

impl Distribution {
    pub fn calculate(items: Vec<(String, f32)>) -> Vec<DistributionItem> {
        let total: f32 = items.iter().map(|(_, v)| v).sum();

        let mut result: Vec<DistributionItem> = items
            .into_iter()
            .map(|(label, value)| {
                let percentage = if total > 0.0 {
                    (value / total) * 100.0
                } else {
                    0.0
                };
                DistributionItem {
                    label,
                    value,
                    percentage,
                }
            })
            .collect();

        // Sort by value desc
        result.sort_by(|a, b| {
            b.value
                .partial_cmp(&a.value)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        result
    }
}
