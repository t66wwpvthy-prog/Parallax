# Parallax — IP Record
**Author:** Nathan Robinson, CFP  
**Date:** 2026-06-04  
**Purpose:** Prior art documentation. Records the state of ideas, architecture, and roadmap as of this date.

---

## What Parallax is

A retirement-planning simulator for financial advisors. Not a consumer product. A professional instrument.

Core thesis: every existing retirement planning tool is built around a bias — conservative outputs that sell products. Parallax has no thesis. It runs the math and reports what's there, equally willing to show a client they're fine as it is to show them they're not. That neutrality is the product.

The primary user: fee-only RIAs, personal-CFO model practices, 150–300+ households, $100M–$500M+ AUM.

---

## What's built

### The engine (`engine.js`)
- 98 years of real annual return data (1928–2025)
- Block-bootstrap Monte Carlo simulation — resamples real historical blocks, not synthetic draws
- Path-consistent: every year within a single simulation uses the same return sequence
- Three account types: Taxable, Traditional (pre-tax), Roth — modeled independently and correctly
- Withdrawal sequencing across account types
- Tax multiplier lever: stress-test the plan against higher future ordinary income rates
- Accumulation phase, pension income, Social Security, long-term care
- Healthcare cost trajectory modeling
- Longevity stress-testing
- One-time spending events (lump sum at a specified age)
- Pure computation — no DOM, no UI, no defaults that quietly bias the output
- Key entry points: `runSimulation()`, `runHistoricalPath()`, `resolveInputs()`, `generateReturnPath()`

### Scenarios tab (built)
- Side-by-side scenario comparison: Baseline + 1–2 alternatives
- Each column: Monte Carlo success % + delta vs baseline
- Levers: Retirement Age, SS Start Age, Annual Spending, One-Time Event, Portfolio Allocation, Annual Savings
- Hero line chart: deterministic expected wealth path in today's dollars
- Line is deterministic — identical inputs always produce identical lines
- Aggressive allocation → higher expected line, lower success circle. That trade-off is visible.

### Sequencing tab (built)
- Same household plan run through real historical market sequences
- Historical paths: 1929 Depression, 1966 lost decade, 1973 stagflation, 1987 Black Monday, 1995 boom, 2000 dot-com, 2008 financial crisis, 2009 recovery bull
- Each line = same spending, same allocation, different market order
- Outcome cards per line: first-decade return, lowest balance, survival age or ran-dry age

---

## Roadmap — ideas conceived and documented as of 2026-06-04

### Input workflow (decided, not yet built)
- RightCapital-style data entry: Net Worth, Goals, Income, Expenses as dedicated input pages
- Feeds UP into the analysis engine
- Not a live control panel — structured data entry workflow
- Modeled on Money Pro's balance details view

### Cash-flow drawer (designed, partially prototyped)
- Year-by-year annual cash flows per scenario, inline in the Scenarios view
- Engine already emits per-year rows per simulation (balance, withdrawal, Social Security, other income, pension)
- This is a VIEW of existing engine output, not new math
- RightCapital-style flow: adjust scenario levers → open cash-flow view in the same window

### Rolling-period historical analysis
- Sweep every valid contiguous historical start year (1928, 1929, … through the last year that fits the horizon)
- Block bootstrap where the block = the full retirement horizon
- Shows the complete historical distribution of outcomes, not just named years
- `runHistoricalPath(startYear)` already exists; this iterates all valid start years and aggregates

### Scenario objects (architecture decision)
- Scenarios become named, saveable objects — not transient slider state
- Sequencing tab selector points at named scenarios from this shared set
- Household-centric data root

### Tax + retirement integration (concept)
- Real tax data (account balances, projected rates, Roth conversion windows) feeds directly into the engine
- Show the RETIREMENT cost of a tax decision in real time — the gap no current tool closes
- Integration layer between tax platforms and the Parallax engine

### Advisor experience direction (decided)
- Light "paper" theme — warm off-white ground, slate ink, brass + teal accents
- Steppers for discrete levers (ages, allocation), sliders for dollar levers (spending, savings)
- Hover guide + value tooltip + end-of-path value labels on the wealth chart
- Delta pill (± pts vs baseline) under each scenario's success circle

---

## What Parallax is not

- Not a consumer app
- Not a robo-advisor
- Not a sales tool or suitability engine
- Does not have an opinion about whether retirement is scary or joyful
- Terminal wealth is not the planning objective — it is only a sort/rank device

---

*This document is a timestamped record of ideas, architecture, and planned features as of the date above. The git commit hash and timestamp associated with this file serve as evidence of prior conception.*
