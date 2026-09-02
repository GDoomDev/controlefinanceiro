import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo, dados) {
  const tipoBuf = Buffer.from(tipo, 'ascii');
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tipoBuf, dados])), 0);
  return Buffer.concat([tamanho, tipoBuf, dados, crc]);
}

/**
 * Ícone quadrado sólido com um losango branco centralizado — o suficiente
 * para instalar na tela inicial (spec, seção 11: "service worker enxuto").
 * PNG truecolor 8 bits, sem paleta, sem dependência nenhuma além de
 * `node:zlib` para o deflate do IDAT.
 */
function gerarIcone(tamanho) {
  const FUNDO = [0x2a, 0x78, 0xd6]; // azul do slot 1 da paleta (spec, seção 9)
  const MARCA = [0xff, 0xff, 0xff];

  const bytesPorLinha = 1 + tamanho * 3; // 1 byte de filtro + RGB por pixel
  const raw = Buffer.alloc(tamanho * bytesPorLinha);
  const meio = tamanho / 2;
  const raioLosango = tamanho * 0.28;

  for (let y = 0; y < tamanho; y++) {
    const inicioDaLinha = y * bytesPorLinha;
    raw[inicioDaLinha] = 0; // filtro None
    for (let x = 0; x < tamanho; x++) {
      const dentroDoLosango = Math.abs(x - meio) + Math.abs(y - meio) <= raioLosango;
      const cor = dentroDoLosango ? MARCA : FUNDO;
      const offset = inicioDaLinha + 1 + x * 3;
      raw[offset] = cor[0];
      raw[offset + 1] = cor[1];
      raw[offset + 2] = cor[2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tamanho, 0);
  ihdr.writeUInt32BE(tamanho, 4);
  ihdr[8] = 8; // profundidade de bits
  ihdr[9] = 2; // tipo de cor: truecolor (RGB)
  ihdr[10] = 0; // compressão
  ihdr[11] = 0; // filtro
  ihdr[12] = 0; // sem interlace

  const assinaturaPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const idat = deflateSync(raw);

  return Buffer.concat([
    assinaturaPng,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('public/icon-192.png', gerarIcone(192));
writeFileSync('public/icon-512.png', gerarIcone(512));
console.log('Ícones gerados: public/icon-192.png, public/icon-512.png');
