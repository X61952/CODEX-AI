'use strict';

const QRCode = require('qrcode');
const jsQR = require('jsqr');
const sharp = require('sharp');

const MAX_TEXT_LENGTH = 2500;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;

class QrToolError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'QrToolError';
        this.code = code;
    }
}

function getQuotedText(message) {
    const quoted = message?.quoted;
    if (!quoted) return '';

    const quotedMessage = quoted.message || {};

    return String(
        quoted.text ||
        quoted.caption ||
        quotedMessage.conversation ||
        quotedMessage.extendedTextMessage?.text ||
        quotedMessage.imageMessage?.caption ||
        quotedMessage.videoMessage?.caption ||
        quotedMessage.documentMessage?.caption ||
        quotedMessage.contactMessage?.vcard ||
        quotedMessage.locationMessage?.address ||
        quotedMessage.locationMessage?.url ||
        ''
    ).trim();
}

async function readQrCode(message) {
    const quoted = message?.quoted;
    const imageMessage = quoted?.message?.imageMessage ||
        (quoted?.mtype === 'imageMessage' ? quoted.msg : null);

    if (!imageMessage || typeof quoted?.download !== 'function') {
        throw new QrToolError(
            'IMAGE_REQUIRED',
            'Reply directly to an image containing a QR code.'
        );
    }

    let imageBuffer;
    try {
        imageBuffer = await quoted.download();
    } catch (error) {
        throw new QrToolError(
            'IMAGE_DOWNLOAD_FAILED',
            `Could not download the replied image: ${error.message}`
        );
    }

    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
        throw new QrToolError(
            'IMAGE_DOWNLOAD_FAILED',
            'The replied image download was empty.'
        );
    }

    if (imageBuffer.length > MAX_IMAGE_BYTES) {
        throw new QrToolError(
            'IMAGE_TOO_LARGE',
            'That image is too large to scan (maximum 25 MB).'
        );
    }

    let decodedImage;
    try {
        decodedImage = await sharp(imageBuffer, {
            limitInputPixels: MAX_IMAGE_PIXELS
        })
            .rotate()
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
    } catch (error) {
        if (/pixel limit|exceeds.*limit/i.test(error.message || '')) {
            throw new QrToolError(
                'IMAGE_TOO_LARGE',
                'That image has too many pixels to scan.'
            );
        }
        throw new QrToolError(
            'IMAGE_UNSUPPORTED',
            `The image could not be decoded (${error.message}).`
        );
    }

    const { data, info } = decodedImage;
    const pixels = new Uint8ClampedArray(
        data.buffer,
        data.byteOffset,
        data.byteLength
    );
    const result = jsQR(pixels, info.width, info.height, {
        inversionAttempts: 'attemptBoth'
    });

    return result?.data || '';
}

async function generateQrCode(text) {
    try {
        return await QRCode.toBuffer(text, {
            type: 'png',
            width: 512,
            margin: 2,
            errorCorrectionLevel: 'M'
        });
    } catch (error) {
        throw new QrToolError(
            'QR_GENERATION_FAILED',
            `Could not generate a QR code for this text: ${error.message}`
        );
    }
}

module.exports = {
    name: 'qr',
    alias: ['genqr', 'makeqr', 'readqr', 'qrread', 'scanqr'],
    desc: 'Generate QR codes or read QR codes from images',
    category: 'tools',
    reactions: { start: '⏳' },

    execute: async (bot, message, args, commandName) => {
        const target = bot?.sock || bot;
        const reply = typeof message?.reply === 'function'
            ? message.reply.bind(message)
            : text => target.sendMessage(
                message.chat,
                { text: String(text) },
                { quoted: message }
            );
        const command = String(commandName || message?.command || '').toLowerCase();
        const commandArgs = Array.isArray(args) ? args : args?.args || [];
        const isReader = ['readqr', 'qrread', 'scanqr'].includes(command);

        try {
            if (isReader) {
                const result = await readQrCode(message);

                if (!result) {
                    return reply('❌ No QR code was detected. Try a sharper, uncropped image.');
                }

                return reply(`🔍 *QR CODE DETECTED*\n\n${result}`);
            }

            const typedText = commandArgs.join(' ').trim();
            const text = typedText || getQuotedText(message);

            if (!text) {
                const quotedMessage = message?.quoted?.message || {};
                const repliedToMedia = Boolean(
                    quotedMessage.imageMessage ||
                    quotedMessage.videoMessage ||
                    quotedMessage.documentMessage ||
                    quotedMessage.audioMessage
                );

                if (repliedToMedia) {
                    return reply(
                        '❌ QR generation needs text or a URL. An image cannot be converted directly into a QR code.\n\n' +
                        'To scan a QR code inside the image, use `.readqr`.'
                    );
                }

                return reply(
                    '*QR CODE TOOL*\n\n' +
                    'Generate: `.qr <text or URL>`\n' +
                    'From a message: reply to it and use `.qr`\n' +
                    'Read an image QR: reply to the image and use `.readqr`'
                );
            }

            if (text.length > MAX_TEXT_LENGTH) {
                return reply(
                    `❌ This content is too long for a QR code (maximum ${MAX_TEXT_LENGTH} characters).`
                );
            }

            const imageBuffer = await generateQrCode(text);

            return await target.sendMessage(
                message.chat,
                {
                    image: imageBuffer,
                    mimetype: 'image/png',
                    caption: '✅ *QR CODE GENERATED*'
                },
                { quoted: message }
            );
        } catch (error) {
            console.error('[qr-tools]', error?.stack || error);

            if (error instanceof QrToolError) {
                return reply(`❌ ${error.message}`);
            }

            return reply(
                '❌ QR processing failed unexpectedly. The detailed error was logged; please retry with another image or shorter text.'
            );
        }
    }
};






























