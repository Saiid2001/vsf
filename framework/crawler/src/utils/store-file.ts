import { createGzip } from "node:zlib";
import {gzip} from 'node-gzip';
import { pipeline } from "node:stream";
import {
    PathLike,
    createWriteStream,
} from 'node:fs';
import { promisify } from 'node:util';

const pipe = promisify(pipeline);

/**
 * Store data as a gzipped file on disk.
 * 
 * @param input Input data to be stored
 * @param output Output path of gzip
 */
const storeGzipped = async (input: string, output: PathLike) => {
    const gzip = createGzip();
    const destination = createWriteStream(output);
    await pipe(input, gzip, destination);
}

const makeGzipped = async (input: string) => {
    return await gzip(input);
}

export { storeGzipped, makeGzipped }