//! The project as an .xlsx a client can read: one sheet for what it costs us,
//! one for what we charge, one for the scenarios, each with a line saying how to read it.

use std::collections::{HashMap, HashSet};

use pricing_engine::{CostBasis, Project, ProjectResult, Recurrence};
use rust_decimal::{prelude::ToPrimitive, Decimal};
use rust_xlsxwriter::{Format, Workbook, Worksheet, XlsxError};

fn num(d: Decimal) -> f64 {
    d.to_f64().unwrap_or_default()
}

/// A cell value: text, an amount of money, or a share shown as a percentage.
enum Cell<'a> {
    Text(&'a str),
    Money(Decimal),
    Pct(Option<Decimal>),
    Count(Decimal),
}

struct Formats {
    title: Format,
    note: Format,
    section: Format,
    head: Format,
    money: Format,
    pct: Format,
    total: Format,
    total_money: Format,
}

/// Writes one sheet top to bottom, keeping the row.
struct Sheet<'a> {
    sheet: &'a mut Worksheet,
    f: &'a Formats,
    row: u32,
}

impl Sheet<'_> {
    fn section(&mut self, text: &str) -> Result<(), XlsxError> {
        self.row += 1;
        self.sheet.write_with_format(self.row, 0, text, &self.f.section)?;
        self.row += 1;
        Ok(())
    }

    fn head(&mut self, titles: &[&str]) -> Result<(), XlsxError> {
        for (col, title) in titles.iter().enumerate() {
            self.sheet.write_with_format(self.row, col as u16, *title, &self.f.head)?;
        }
        self.row += 1;
        Ok(())
    }

    fn line(&mut self, cells: &[Cell], total: bool) -> Result<(), XlsxError> {
        for (col, cell) in cells.iter().enumerate() {
            let col = col as u16;
            match cell {
                Cell::Text(t) if total => self.sheet.write_with_format(self.row, col, *t, &self.f.total)?,
                Cell::Text(t) => self.sheet.write(self.row, col, *t)?,
                Cell::Money(v) if total => self.sheet.write_with_format(self.row, col, num(*v), &self.f.total_money)?,
                Cell::Money(v) => self.sheet.write_with_format(self.row, col, num(*v), &self.f.money)?,
                Cell::Pct(Some(v)) => self.sheet.write_with_format(self.row, col, num(*v), &self.f.pct)?,
                Cell::Pct(None) => self.sheet.write(self.row, col, "—")?,
                Cell::Count(v) => self.sheet.write(self.row, col, num(*v))?,
            };
        }
        self.row += 1;
        Ok(())
    }

    /// Fits the columns to the tables, then puts the title and the note on top,
    /// so a long note doesn't widen the first column.
    fn finish(self, title: &str, note: &str) -> Result<(), XlsxError> {
        self.sheet.autofit();
        self.sheet.write_with_format(0, 0, title, &self.f.title)?;
        self.sheet.write_with_format(1, 0, note, &self.f.note)?;
        Ok(())
    }
}

fn margin(price: Decimal, cost: Decimal) -> Option<Decimal> {
    (price > Decimal::ZERO).then(|| (price - cost) / price)
}

pub fn workbook(project: &Project, result: &ProjectResult) -> Result<Vec<u8>, XlsxError> {
    let cur = project.currency.code();
    let f = Formats {
        title: Format::new().set_bold().set_font_size(16),
        note: Format::new().set_italic().set_font_color("#6B6580"),
        section: Format::new().set_bold().set_font_size(12),
        head: Format::new().set_bold().set_background_color("#F2F0F7"),
        money: Format::new().set_num_format("#,##0.00"),
        pct: Format::new().set_num_format("0.0%"),
        total: Format::new().set_bold(),
        total_money: Format::new().set_bold().set_num_format("#,##0.00"),
    };
    let mut book = Workbook::new();
    let platform: Vec<_> = project.structure.shared.iter().filter(|c| !c.removed).collect();
    let items: HashMap<&str, _> = project.onboarding.iter().map(|i| (i.id.as_str(), i)).collect();
    // Only what some scenario or plan actually charges, as in the report.
    let used: HashSet<&str> = result
        .bands
        .iter()
        .flat_map(|b| &b.onboarding_ids)
        .chain(result.plans.iter().flat_map(|p| &p.onboarding_ids))
        .map(String::as_str)
        .collect();
    let lines: Vec<_> = result.onboarding_lines.iter().filter(|l| used.contains(l.id.as_str())).collect();
    let billed = |r: Recurrence| if r == Recurrence::OneOff { "Once" } else { "Every year" };

    // 1 · Costs
    {
        let mut s = Sheet { sheet: book.add_worksheet().set_name("Costs")?, f: &f, row: 2 };
        s.section(&format!("Platform, in {cur}"))?;
        s.head(&["Service", "Per month", "Per year"])?;
        for cost in &platform {
            s.line(&[Cell::Text(&cost.name), Cell::Money(cost.monthly), Cell::Money(cost.monthly * Decimal::from(12))], false)?;
        }
        let month: Decimal = platform.iter().map(|c| c.monthly).sum();
        s.line(&[Cell::Text("Total"), Cell::Money(month), Cell::Money(month * Decimal::from(12))], true)?;

        if !lines.is_empty() {
            s.section(&format!("Onboarding, in {cur}"))?;
            s.head(&["Service", "Group", "Billed", "Counted per", "Cost"])?;
            for line in &lines {
                let per = match items.get(line.id.as_str()).map(|i| i.basis) {
                    Some(CostBasis::PerProject) => "Project",
                    _ => "Building",
                };
                s.line(
                    &[
                        Cell::Text(&line.name),
                        Cell::Text(&line.category),
                        Cell::Text(billed(line.recurrence)),
                        Cell::Text(per),
                        Cell::Money(line.unit_cost),
                    ],
                    false,
                )?;
            }
        }
        s.finish(
            "What it costs us",
            "What we pay to run the platform, and what each onboarding service costs us, before any margin.",
        )?;
    }

    // 2 · Pricing
    {
        let mut s = Sheet { sheet: book.add_worksheet().set_name("Pricing")?, f: &f, row: 2 };
        s.section(&format!("Platform passed on to the client, at cost, in {cur}"))?;
        s.head(&["Service", "Client pays", "Per month", "Per year"])?;
        for cost in &platform {
            let paid = cost.monthly * cost.share;
            s.line(
                &[Cell::Text(&cost.name), Cell::Pct(Some(cost.share)), Cell::Money(paid), Cell::Money(paid * Decimal::from(12))],
                false,
            )?;
        }
        let month: Decimal = platform.iter().map(|c| c.monthly * c.share).sum();
        s.line(&[Cell::Text("Total"), Cell::Text(""), Cell::Money(month), Cell::Money(month * Decimal::from(12))], true)?;

        if !lines.is_empty() {
            s.section(&format!("Onboarding prices, in {cur}"))?;
            s.head(&["Service", "Billed", "Cost", "We charge", "Profit", "Margin"])?;
            for line in &lines {
                s.line(
                    &[
                        Cell::Text(&line.name),
                        Cell::Text(billed(line.recurrence)),
                        Cell::Money(line.unit_cost),
                        Cell::Money(line.unit_price),
                        Cell::Money(line.unit_price - line.unit_cost),
                        Cell::Pct(line.margin),
                    ],
                    false,
                )?;
            }
        }
        s.finish(
            "What we charge",
            "The platform is passed on at cost, for the share this client pays. Each onboarding service has its own price. \
             The subscription price is set per scenario, on the next sheet.",
        )?;
    }

    // 3 · Scenarios
    if !result.bands.is_empty() {
        let names: HashMap<_, _> = result.onboarding_lines.iter().map(|l| (l.id.as_str(), l.name.as_str())).collect();
        let discounts = project.bands.iter().any(|b| b.discount > Decimal::ZERO);
        let discount_of: HashMap<&str, Decimal> = project.bands.iter().map(|b| (b.id.as_str(), b.discount)).collect();
        let mut s = Sheet { sheet: book.add_worksheet().set_name("Scenarios")?, f: &f, row: 2 };

        s.section(&format!("Each scenario, in {cur}"))?;
        let mut head = vec!["Scenario", "Buildings", "Price per building / month"];
        if discounts {
            head.push("Discount");
        }
        head.extend(["Onboarding (once)", "Subscription (per year)", "Yearly services (per year)", "Year 1 total", "Year 1 profit", "Margin"]);
        s.head(&head)?;
        for band in &result.bands {
            let name = format!("Band {}", band.position);
            let year1 = band.years.first();
            let per_month = band.subscription.price_per_building.map(|p| p / Decimal::from(12)).unwrap_or_default();
            let mut cells = vec![Cell::Text(&name), Cell::Count(band.buildings), Cell::Money(per_month)];
            if discounts {
                cells.push(Cell::Pct(Some(discount_of.get(band.band_id.as_str()).copied().unwrap_or_default())));
            }
            let (price, cost, profit) = year1.map(|y| (y.price, y.cost, y.profit)).unwrap_or_default();
            cells.extend([
                Cell::Money(band.onboarding.price),
                Cell::Money(band.subscription.price),
                Cell::Money(band.yearly_extras.price),
                Cell::Money(price),
                Cell::Money(profit),
                Cell::Pct(margin(price, cost)),
            ]);
            s.line(&cells, false)?;
        }

        s.section("What each scenario includes")?;
        s.head(&["Scenario", "Onboarding and yearly services"])?;
        for band in &result.bands {
            let name = format!("Band {}", band.position);
            let includes: Vec<_> = band.onboarding_ids.iter().map(|id| names.get(id.as_str()).copied().unwrap_or(id)).collect();
            let includes = if includes.is_empty() { "Subscription only".to_string() } else { includes.join(", ") };
            s.line(&[Cell::Text(&name), Cell::Text(&includes)], false)?;
        }
        s.finish(
            "Scenarios",
            "Each scenario is a number of buildings; its amounts are for all of them. \
             Year 1 adds the onboarding, 12 months of subscription and the yearly services.",
        )?;
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
