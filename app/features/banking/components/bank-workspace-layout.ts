/** Geometry shared by Bank routes only; portals and other ERP modules stay outside it. */
export const bankWorkspaceLayout = [
  "[&_h1]:m-0! [&_h1]:text-lg! [&_h2]:mt-0 [&_h3]:mt-0",
  "[&_p]:my-0! [&_dl]:my-0 [&_dd]:mx-0!",
  "[&_.nx-page-intro]:mb-3! [&_.nx-page-intro]:items-center! [&_.nx-page-intro]:gap-2!",
  "[&_.nx-page-actions]:gap-2! [&_.nx-txn-layout]:gap-3! [&_.nx-txn-main]:gap-3!",
  "[&_.nx-form-grid]:gap-3! [&_.nx-form-grid]:p-3!",
  "[&_.nx-form-section>header]:min-h-0! [&_.nx-form-section>header]:p-3!",
  "[&_.nx-batch]:gap-3! [&_.nx-data-table_th]:py-1.5! [&_.nx-data-table_td]:py-1.5!",
].join(" ");
