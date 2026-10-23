# Setting up the POS for a business

One install per business: its own Vercel project, its own database, its own
payment account. Nothing is shared between businesses.

## 1. Accounts (in the business's name, you as admin)

- **Neon**: new project → copy the pooled connection string (`DATABASE_URL`)
  and the direct one (`DIRECT_URL`).
- **Vercel**: new project from this repo.
- **Payments**: **Square** (recommended: Square Terminal at the register and
  self-checkout, online cards on Square's checkout page, automatic refunds),
  or their **Clover** account, or **Stripe** (S700/S710 reader and online
  cards). When several are set up, Square is used first, then Clover, then
  Stripe.
- **Resend** (order emails): add and verify their domain.
- **Twilio** (texts, optional): number + A2P 10DLC registration. The
  registration form needs `https://<their site>/order/privacy` and
  `/order/terms`, which the app provides.

## 2. Environment variables (Vercel → Settings → Environment Variables)

| Variable | What |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Neon |
| `SESSION_SECRET` | 64 random characters (`openssl rand -hex 32`) |
| `PUBLIC_ORDER_HOSTS` | their order domain(s), e.g. `kaymanman.com,www.kaymanman.com` (**required**: the default is Mondy's) |
| `PUBLIC_SITE_URL` | e.g. `https://www.kaymanman.com` (links in emails) |
| Clover: `CLOVER_*` / Stripe: `STRIPE_*`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | payments |
| `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL` | emails, e.g. `Kay Manman <orders@kaymanman.com>` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | texts (optional) |
| `SESSION_IDLE_MINUTES` | register auto sign-out, default 5 |
| `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_ENVIRONMENT` | Square: register and self-checkout Terminals, online cards (`production` or `sandbox`) |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` (optional) | instant online confirmations; webhook URL `https://<site>/api/square/webhook`, events `payment.created`, `payment.updated` |
| `SQUARE_ONLINE_PAYMENTS=off` (optional) | keep online cards on Clover/Stripe while using Square Terminals |

## 3. Database and business details

```
npx prisma db push
npx tsx prisma/seed.ts                     # first time only
cp brands/example.json brands/<client>.json  # fill in name, colors, hours, tax…
npx tsx scripts/setup-business.ts brands/<client>.json           # preview
npx tsx scripts/setup-business.ts brands/<client>.json --apply
```

Logo (optional): put `logo.png` or `logo.svg` in `public/`. Without one, the
name is shown as a text wordmark. Brand name, colors, and the Rewards and news
corner names can be changed later in **Online settings → Brand**.

## 4. Staff

Create `staff-pins.json` (never committed), then:

```
npx tsx scripts/set-staff-pins.ts            # preview
npx tsx scripts/set-staff-pins.ts --apply    # also turns off the test accounts
```

## 5. Menu

Enter dishes on **Today's menu** (or a load script), photos on **Dish
photos**, packaged drinks by scanning them once on the register.

## 6. Square (card payments)

1. **Square setup** (staff menu): check "Connected", then **Pair a Square
   Terminal** for the register: on the Terminal, sign in → Device code, and
   type the code shown.
2. Cashiers tap **Card**: the total shows on the Terminal; the sale saves
   itself when the customer pays. **Card (manual)** asks for the card number on
   the Terminal. Pickup orders paid at the counter use the same Terminal.
3. Online orders pay on Square's page. No setup needed beyond the Square
   settings; add the webhook (above) for instant confirmations.
4. **Void** an order with a manager PIN and the card is refunded through
   Square automatically.
5. Moving from Clover: once Square works, delete the `CLOVER_*` variables in
   Vercel (Square is already used first, so nothing breaks before then).

## 7. Self-checkout (optional)

For self-serve fridges and grab-and-go shelves:

1. **Barcode stickers** (staff menu): give each item a store barcode and print
   stickers on a thermal label printer (2.25" × 1.25" labels).
2. **Self-checkout setup** (staff menu): choose Square Terminal, Stripe
   reader, or Pay at the counter; pair the self-checkout's own Square Terminal
   (not the register's) with the code shown;
   paste the CloudPRNT URL into the Star receipt printer's settings and press
   **Print a test receipt**.
3. On the tablet by the food: sign in, open **Self-checkout screen**, and turn
   on Guided Access (iPad) or screen pinning (Android). Staff leave it with a
   manager PIN.

## 8. Test, then clear

Place a few orders (online and register, cash and card, one void with
refund), print a daily report, download the accounting export. Then:

```
npx tsx scripts/clear-test-data.ts           # preview
npx tsx scripts/clear-test-data.ts --apply   # before the first real customer
```

## 9. Go live

- Switch payment keys from test to live and do one real $1 order + refund.
- Confirm the meals tax rate (Tax & accounting).
- Domain in Vercel (www primary), then check `/order`, `/order/privacy`, `/order/terms`.
- Train staff (30–45 min): sale, cash/card, void, online queue, kitchen screen, Today's menu.
