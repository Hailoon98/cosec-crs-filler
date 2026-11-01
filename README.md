# COSEC CRS Filler
Tampermonkey script: pick a case, one click fills the SSM CRS form. Never saves or submits.

## Install (team)
1. Install Tampermonkey (Chrome/Edge).
2. Open: https://raw.githubusercontent.com/Hailoon98/cosec-crs-filler/main/cosec_crs.user.js -> Install.
3. Open https://crs.ssm4u.com.my. When asked, paste API URL + TOKEN (from admin). Once per browser.
4. Wrong values? Console: `cosecReset()`.

## Admin
Deploy `Code.gs` as Apps Script Web App from the Sheet-owner account (Execute as: Me, Access: Anyone). Set your own TOKEN. Never commit URL/TOKEN.
