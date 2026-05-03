import assert from 'assert';
import { buildZaloImageMessage } from './zaloMessage';

const message = buildZaloImageMessage('attachment-123', 'Hicado payment slip');

assert.deepStrictEqual(message, {
  text: 'Hicado payment slip',
  attachment: {
    type: 'template',
    payload: {
      template_type: 'media',
      elements: [
        {
          media_type: 'image',
          attachment_id: 'attachment-123',
        },
      ],
    },
  },
});

console.log('zaloMessage tests passed');
