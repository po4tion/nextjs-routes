import { readdirSync, statSync } from "fs";
import { join, parse } from "path";

const NEXTJS_NON_ROUTABLE_PREFIX = "_";
export const NEXTJS_PAGES_DIRECTORY_NAME = "pages";
const DYNAMIC_SEGMENT_RE = /\[(.*?)\]/g;

// istanbul ignore next
export function findFiles(entry: string): string[] {
  return readdirSync(entry).flatMap((file) => {
    const filepath = join(entry, file);
    if (
      statSync(filepath).isDirectory() &&
      !filepath.includes("node_modules")
    ) {
      return findFiles(filepath);
    }
    return filepath;
  });
}

type QueryType = "dynamic" | "catch-all" | "optional-catch-all";

interface Route {
  pathname: string;
  query: Record<string, QueryType>;
}

export function nextRoutes(files: string[]): Route[] {
  const filenames = files
    .map((file) =>
      file.replace(NEXTJS_PAGES_DIRECTORY_NAME, "").replace(parse(file).ext, "")
    )
    .filter((file) => !parse(file).name.startsWith(NEXTJS_NON_ROUTABLE_PREFIX));

  return filenames.map((filename) => {
    const segments = filename.match(DYNAMIC_SEGMENT_RE) ?? [];
    const query = segments.reduce<Route["query"]>((acc, cur) => {
      const param = cur
        .replace(/\[/g, "")
        .replace(/\]/g, "")
        .replace("...", "");
      let queryType: QueryType = "dynamic";
      if (cur.startsWith("[[")) {
        queryType = "optional-catch-all";
      } else if (cur.startsWith("[...")) {
        queryType = "catch-all";
      }
      acc[param] = queryType;
      return acc;
    }, {});

    const pathWithoutIndexSuffix = filename.replace(/index$/, "");

    return {
      pathname: pathWithoutIndexSuffix,
      query,
    };
  });
}

function getQueryInterface(query: Route["query"]): string {
  let res = "";
  Object.entries(query).forEach(([key, value]) => {
    res += key;
    switch (value) {
      case "dynamic": {
        res += ": string";
        break;
      }
      case "catch-all": {
        res += ": string[]";
        break;
      }
      case "optional-catch-all": {
        res += "?: string[]";
        break;
      }
      // istanbul ignore next
      default: {
        const _exhaust: never = value;
        return _exhaust;
      }
    }
    res += "; ";
  });

  if (res) {
    return `{ ${res}}`;
  }
  return res;
}

export function generate(routes: Route[]): string {
  return `\
// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.'
// Run \`yarn nextjs-routes\` to regenerate this file.

type Routes =
  | ${routes
    .map((route) => {
      const query = getQueryInterface(route.query);
      if (query) {
        return `{ pathname: '${route.pathname}', query: ${query} }`;
      } else {
        return (
          `{ pathname: '${route.pathname}' }` + `\n  | '${route.pathname}'`
        );
      }
    })
    .join("\n  | ")}

declare module "next/link" {
  import type { LinkProps as NextLinkProps } from "next/link";
  import type { PropsWithChildren, MouseEventHandler } from "react";

  interface LinkProps extends Omit<NextLinkProps, "href"> {
    href: Routes;
  }

  declare function Link(
    props: PropsWithChildren<LinkProps>
  ): DetailedReactHTMLElement<
    {
      onMouseEnter?: MouseEventHandler<Element> | undefined;
      onClick: MouseEventHandler;
      href?: string | undefined;
      ref?: any;
    },
    HTMLElement
  >;

  export default Link;
}

declare module "next/router" {
  import type { NextRouter } from "next/router";

  type TransitionOptions = Parameters<NextRouter["push"]>[2];

  interface Router extends Omit<NextRouter, "push" | "replace"> {
    push(
      url: Routes,
      as?: Routes,
      options?: TransitionOptions
    ): Promise<boolean>;
    replace(
      url: Routes,
      as?: Routes,
      options?: TransitionOptions
    ): Promise<boolean>;
  }

  export function useRouter(): Router;
}

`;
}
