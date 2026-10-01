import { Application } from 'express';

export interface RouteInfo {
    method: string;
    path: string;
}

// Express 4 keeps a mounted path only as a regexp on the layer; this turns it back into a string
function mountPath(layer: any): string {
    const source: string = layer.regexp?.source ?? '';
    if (source === '^\\/?(?=\\/|$)') return '';
    return source
        .replace('\\/?(?=\\/|$)', '')
        .replace(/^\^/, '')
        .replace(/\\\//g, '/');
}

function collect(stack: any[], prefix: string, out: RouteInfo[]): void {
    for (const layer of stack) {
        if (layer.route) {
            const paths: string[] = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
            for (const method of Object.keys(layer.route.methods)) {
                for (const p of paths) {
                    out.push({ method: method.toUpperCase(), path: `${prefix}${p}` });
                }
            }
        } else if (layer.name === 'router' && layer.handle?.stack) {
            collect(layer.handle.stack, prefix + mountPath(layer), out);
        }
    }
}

/** Every method and full path the app serves, sorted, for docs and drift checks. */
export function listRoutes(app: Application): RouteInfo[] {
    const out: RouteInfo[] = [];
    collect((app as any)._router?.stack ?? [], '', out);
    return out.sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)));
}
