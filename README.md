# Vino da vendere

Sito per raccogliere gli ordini di cartoni di vino.

- `index.html`: la pagina (telefono e computer)
- `functions/api/stato.js`: legge vini e ordini
- `functions/api/ordine.js`: crea e annulla gli ordini
- `schema.sql`: tabelle e vini iniziali per il database D1

Su Cloudflare Pages serve un collegamento D1 chiamato `DB`.
Per annullare qualsiasi ordine come amministratore, aggiungi la variabile segreta `ADMIN_KEY`
e apri il sito una volta con `?admin=LA_TUA_CHIAVE`.
