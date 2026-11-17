//! The project as an .xlsx: what it costs, what we charge, and every scenario.

use pricing_engine::{Project, ProjectResult, Recurrence};
use rust_decimal::{prelude::ToPrimitive, Decimal};
use rust_xlsxwriter::{Format, Workbook, Worksheet, XlsxError};

fn num(d: Decimal) -> f64 {
    d.to_f64().unwrap_or_default()
}

fn header(sheet: &mut Worksheet, row: u32, titles: &[&str], bold: &Format) -> Result<(), XlsxError> {
    for (col, title) in titles.iter().enumerate() {
        sheet.write_with_format(row, col as u16, *title, bold)?;
    }
    Ok(())
}

pub fn workbook(project: &Project, result: &ProjectResult) -> Result<Vec<u8>, XlsxError> {
    let cur = project.currency.code();
    let bold = Format::new().set_bold();
    let money = Format::new().set_num_format("#,##0.00");
    let pct = Format::new().set_num_format("0.0%");
    let mut book = Workbook::new();

    // 1 · What it costs us
    let costs = book.add_worksheet().set_name("Costs")?;
    header(costs, 0, &["Platform service", &format!("Monthly ({cur})"), "Share", &format!("We pay / month ({cur})")], &bold)?;
    let mut row = 1;
    for cost in project.structure.shared.iter().filter(|c| !c.removed) {
        costs.write(row, 0, &cost.name)?;
        costs.write_with_format(row, 1, num(cost.monthly), &money)?;
        costs.write_with_format(row, 2, num(cost.share), &pct)?;
        costs.write_with_format(row, 3, num(cost.monthly * cost.share), &money)?;
        row += 1;
    }

    // 2 · What we charge, per unit
    row += 1;
    header(costs, row, &["Onboarding element", "Category", "Billed", &format!("Cost ({cur})"), &format!("We charge ({cur})"), "Margin"], &bold)?;
    for line in &result.onboarding_lines {
        row += 1;
        costs.write(row, 0, &line.name)?;
        costs.write(row, 1, &line.category)?;
        costs.write(row, 2, if line.recurrence == Recurrence::OneOff { "One-off" } else { "Annual" })?;
        costs.write_with_format(row, 3, num(line.unit_cost), &money)?;
        costs.write_with_format(row, 4, num(line.unit_price), &money)?;
        if let Some(m) = line.margin {
            costs.write_with_format(row, 5, num(m), &pct)?;
        }
    }
    costs.autofit();

    // 3 · Scenarios
    if !result.bands.is_empty() {
        let names: std::collections::HashMap<_, _> =
            result.onboarding_lines.iter().map(|l| (l.id.as_str(), l.name.as_str())).collect();
        let sheet = book.add_worksheet().set_name("Scenarios")?;
        header(
            sheet,
            0,
            &[
                "Scenario", "Buildings", "Quote / building / month", "Onboarding billed", "Onboarding cost",
                "Onboarding profit", "Subscription / year", "Subscription cost", "Subscription profit",
                "Year 1 profit", "3-year profit", "Includes",
            ],
            &bold,
        )?;
        for (i, band) in result.bands.iter().enumerate() {
            let r = i as u32 + 1;
            let year1 = band.years.first().map(|y| y.profit).unwrap_or_default();
            sheet.write(r, 0, format!("Band {}", band.position))?;
            sheet.write(r, 1, num(band.buildings))?;
            let quote = band.subscription.price_per_building.map(|p| p / Decimal::from(12));
            if let Some(q) = quote {
                sheet.write_with_format(r, 2, num(q), &money)?;
            }
            for (col, v) in [
                band.onboarding.price, band.onboarding.cost, band.onboarding.profit,
                band.subscription.price, band.subscription.cost, band.subscription.profit,
                year1, band.three_year_profit,
            ]
            .into_iter()
            .enumerate()
            {
                sheet.write_with_format(r, col as u16 + 3, num(v), &money)?;
            }
            let includes: Vec<_> = band.onboarding_ids.iter().map(|id| names.get(id.as_str()).copied().unwrap_or(id)).collect();
            sheet.write(r, 11, includes.join(", "))?;
        }
        sheet.autofit();
    }

    book.save_to_buffer()
}

#[cfg(test)]
mod tests {
    use pricing_engine::{plan_project, Currency, Project, ProjectTemplate};

    #[test]
    fn builds_a_workbook_for_every_template() {
        for template in [ProjectTemplate::BuildingOwners, ProjectTemplate::Contractors] {
            let p = Project::from_template("p".into(), "T".into(), "C".into(), "now".into(), template, Currency::GBP);
            let bytes = super::workbook(&p, &plan_project(&p)).unwrap();
            assert!(bytes.starts_with(b"PK")); // an xlsx is a zip
        }
    }
}
