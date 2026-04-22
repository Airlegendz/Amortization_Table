# Amortization_Table

A simple static website that calculates a fixed-payment loan amortization schedule and renders the full month-by-month table.

## Features

- Loan inputs: **principal**, **APR (%)**, **term (years)**
- Outputs: **monthly payment** and full **amortization schedule**
- **Light/Dark mode** toggle (saved in `localStorage`)
- **Export CSV** of the generated schedule

## Run locally

From the project folder (after cloning/downloading this repo):

```bash
cd Amortization_Table
python3 -m http.server 8080
```

Then open:

- `http://localhost:8080`

## Files

- `index.html`: page layout
- `styles.css`: styling + light/dark theme variables
- `calc.js`: calculator logic + CSV export
