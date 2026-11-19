import chongqing from './chongqing.js';
import lujiazui from './lujiazui.js';
import xian from './xian.js';
import shenzhen from './shenzhen.js';
import jiangnan from './jiangnan.js';

export const STYLES = [chongqing, lujiazui, xian, shenzhen, jiangnan];

export const STYLE_MAP = Object.fromEntries(STYLES.map((s) => [s.id, s]));

export const DEFAULT_SEED = 20261119;
