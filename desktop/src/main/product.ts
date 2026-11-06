/**
 * Who the program is. The bundler (scripts/build.mjs) compiles release/release.json into the main process as `__PRODUCT__`, so there is
 * ONE authoritative copy (docs/RELEASE.md) and nothing here can disagree with the installer or the backend about the version.
 */
export interface Product {
  name: string;
  shortName: string;
  developer: string;
  version: string;
  channel: string;
  copyright: string;
}

declare const __PRODUCT__: Product;

export const product: Product = __PRODUCT__;
