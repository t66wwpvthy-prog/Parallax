from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH

BRASS = RGBColor(0xB0, 0x7D, 0x34)
INK   = RGBColor(0x1d, 0x19, 0x13)
GREY  = RGBColor(0x6b, 0x62, 0x53)
ITAL  = RGBColor(0x8a, 0x7c, 0x61)

doc = Document()
for s in doc.sections:
    s.top_margin = Inches(0.9); s.bottom_margin = Inches(0.9)
    s.left_margin = Inches(1.0); s.right_margin = Inches(1.0)

t = doc.add_paragraph()
r = t.add_run("PARALLAX — Idea Bank"); r.bold = True
r.font.size = Pt(22); r.font.color.rgb = INK
sub = doc.add_paragraph("Everything we've parked, in plain language. One line per idea.")
sub.runs[0].font.size = Pt(11); sub.runs[0].font.italic = True; sub.runs[0].font.color.rgb = GREY
meta = doc.add_paragraph("Updated 2026-06-03 · tags: BIG = its own session · NEXT = build soon · MOCK = waiting your OK")
meta.runs[0].font.size = Pt(8.5); meta.runs[0].font.color.rgb = RGBColor(0x9a,0x8f,0x7c)
doc.add_paragraph()

def section(title):
    h = doc.add_heading(level=1)
    run = h.add_run(title); run.font.color.rgb = BRASS; run.font.size = Pt(14); run.bold = True

def lede(text):
    p = doc.add_paragraph(text)
    p.runs[0].font.size = Pt(9.5); p.runs[0].font.italic = True; p.runs[0].font.color.rgb = GREY

def bullet(lead, rest="", tag=""):
    p = doc.add_paragraph(style="List Bullet")
    a = p.add_run(lead); a.bold = True; a.font.size = Pt(10.5); a.font.color.rgb = INK
    if rest:
        b = p.add_run(" — " + rest); b.font.size = Pt(10.5); b.font.color.rgb = RGBColor(0x33,0x2f,0x29)
    if tag:
        g = p.add_run("  [" + tag + "]"); g.font.size = Pt(8); g.bold = True; g.font.color.rgb = ITAL

section("1 · Math the engine can't do yet")
bullet("Own your home & property", "model the house/business so you can show “sell this to pay for that.”", "BIG")
bullet("Tax planning", "Roth conversions, tax brackets, IRMAA, required withdrawals. A whole separate engine.", "BIG")
bullet("Survivor Social Security", "when one spouse dies, the other keeps the bigger check. Big for couples; not modeled.")
bullet("Separate healthcare from lifestyle", "today, cutting spending also cuts medical — which isn't real.")
bullet("Care costs that climb", "long-term care rises faster than normal inflation; today it's flat.")
bullet("Money coming IN once", "downsizing or a sale adds cash; today the tool only handles money going out.")
bullet("Plan the other engines", "tax, estate — sketch them before building piece by piece.")

section("2 · What makes Parallax different")
lede("Most tools just move sliders and watch a number. This is the part competitors can't copy.")
bullet("Answer the client's question", "instead of guessing, they ask “Can I retire earlier?” and the tool finds the answer and drops it in as a new column.", "NEXT")
bullet("Show the realistic combos", "when one change isn't enough: “retire at 62 if you spend $850/mo less, OR save more and claim SS later.”")
bullet("The decision map", "one picture of every retirement-age × spending combo, colored by confidence. Click a spot to make it a scenario.")

section("3 · Easy wins — just show what's already in the numbers")
bullet("Why it fails", "click the % and see when the money runs out and which years are tightest.")
bullet("Meeting summary", "a clean one-pager of what changed and what it did — the thing you hand the client.")
bullet("The danger years", "the first 10 retirement years laid out, so you can see why retiring into 1973 or 2000 hurt.")
bullet("The gap before Social Security", "show the years the portfolio has to carry before SS/pension starts.")
bullet("Plain-English tiles", "“could retire at 58,” “safe to spend $X,” “14 years of cushion.”")
bullet("Year-by-year confidence", "green/yellow/red per year (only if it's real data).")

section("4 · Scenarios & inputs")
bullet("Add-account picker", "401k, IRA, Roth, etc. Built as a mock — waiting your OK to go live.", "MOCK")
bullet("Cleaner scenario layout", "stop repeating three identical columns; show one value, split only where they differ.", "BIG")
bullet("Pension timing", "sweep claim ages 62→70 and show the break-even.")
bullet("Property input screen", "where you enter homes and other real assets.")
bullet("Duplicate a scenario", "a copy button, separate from “Add.”")

section("5 · Sequencing — same plan, different markets")
bullet("Test moves against one bad market", "pick a tough year, then compare strategies on it. Your #1 use.")
bullet("Years underwater", "how long a plan stays below where it started — even when it survives.")
bullet("Name each crash", "“short shock” (2008, bounces back) vs “long grind” (1966/1973, slow bleed).")

section("6 · Added this session")
bullet("Sell-the-home event", "when sold: price minus mortgage minus tax. Include the $250k/$500k home-sale tax break and improvements. (Purchase price already saved.)")
bullet("Tax type per income", "mark income taxable, tax-free, or capital-gains; today it's all taxed the same.")
bullet("Safe-withdrawal solver", "work out a sustainable yearly draw — and call it that, not “income.”")
bullet("Income that fades", "let fixed annuities lose value to inflation like they really do.")
bullet("Run every year of history", "test the plan against every real start year, not just a chosen few.")
bullet("Nicer Goals page", "end-dates are done; the better-looking layout is pinned for later.")

section("7 · Future screens")
bullet("Full plan view", "the whole plan on one clean page to hand the client (read-only).")
bullet("Prospect view", "a quick, light version to show value before building a full plan.")
bullet("Investment comparison", "proposed vs current. Careful — overlaps Scenarios; pin the angle first.")

section("8 · Small fixes & cleanup")
bullet("Rename “Net Worth” tab → “Plan”", "it holds more than net worth now.")
bullet("Write down the color rules", "so the look stays consistent as it grows.")
bullet("“Where did this number come from” tags", "light touch — don't overbuild it.")

section("9 · Decisions for you")
bullet("Demo mortgage", "keep it (84.9%) or pay it off (~86.5%)?")
bullet("Make Assets the wider column?", "Liabilities is usually sparse.")
bullet("Social Security framing", "lifetime dollars vs the % — it barely moves the % for big spenders.")
bullet("Solve-For display", "avoid the confusing one-lever-vs-all-levers %.")
bullet("Liabilities", "one base plan, or per scenario?")
bullet("Strategy Fork", "does it live in Sequencing or Scenarios?")

section("10 · Decided NO — don't re-litigate")
bullet("Fancy cash-flow river diagram", "looks nice, shows nothing new.")
bullet("“Resilience Matrix” as a new tab", "old idea; overlaps what we already have.")
bullet("Renaming Parallax", "a business call, not now.")
bullet("Reverse-the-timeline view", "killed — it's a story that never happened.")
bullet("Allocation as a solve lever", "only with careful framing.")

doc.add_paragraph()
note = doc.add_paragraph()
nr = note.add_run("How we work.  "); nr.bold = True; nr.font.size = Pt(9.5); nr.font.color.rgb = BRASS
nb = note.add_run("Subtract before adding. The engine is the one source of truth — the screens only show or adjust it, never invent math. Mock big visual changes first. Check by looking, not guessing.")
nb.font.size = Pt(9.5); nb.font.color.rgb = GREY; nb.font.italic = True

doc.save("/home/user/Parallax/Parallax-Idea-Bank.docx")
print("Done.")
