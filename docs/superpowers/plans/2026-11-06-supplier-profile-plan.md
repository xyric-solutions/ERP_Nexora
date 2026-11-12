# Supplier implementation plan

1. Extend Procurement supplier schemas with a bounded optional profile; add an
   additive migration and persist profiles in existing audited transactions.
2. Expose Suppliers in Purchase navigation; build the tabbed full-page editor
   using shared controls and keep the current directory/search behavior.
3. Cover contract validation, UI error/save/edit behavior, legacy API updates,
   persistence and audit history. Extend the real-API browser workflow.
4. Generate API artifacts; run focused tests, type checks, lint/format checks,
   migrations, theme audit, responsive browser checks and an isolated web build.
5. Update existing architecture/migration documentation with results and limits.
