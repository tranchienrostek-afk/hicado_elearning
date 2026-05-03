export type ZaloCsMessage = {
  text?: string;
  attachment?: {
    type: 'template';
    payload: {
      template_type: 'media';
      elements: Array<{
        media_type: 'image';
        attachment_id: string;
      }>;
    };
  };
};

export function buildZaloImageMessage(attachmentId: string, text?: string): ZaloCsMessage {
  const message: ZaloCsMessage = {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'media',
        elements: [
          {
            media_type: 'image',
            attachment_id: attachmentId,
          },
        ],
      },
    },
  };

  if (text?.trim()) message.text = text.trim();

  return message;
}
