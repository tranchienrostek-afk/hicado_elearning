/**
 * VietQR Generation Logic (EMVCo Standard)
 * Based on NAPAS VietQR specification.
 */

function calculateCRC16(data: string): string {
  let crc = 0xFFFF;
  const polynomial = 0x1021;

  for (let i = 0; i < data.length; i++) {
    crc ^= (data.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polynomial) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatField(id: string, value: string): string {
  const length = value.length.toString().padStart(2, '0');
  return `${id}${length}${value}`;
}

export function generateVietQRString(
  bankBin: string,
  accountNo: string,
  amount: number,
  memo: string
): string {
  // 00: Payload Format Indicator
  let qrString = formatField('00', '01');
  
  // 01: Point of Initiation Method (12 for dynamic QR with amount)
  qrString += formatField('01', '12');

  // 38: Merchant Account Information (Consumer ID & Service Code)
  const guid = formatField('00', 'A000000727'); // NAPAS GUID
  const bankInfo = formatField('00', bankBin) + formatField('01', accountNo);
  const merchantAccount = guid + formatField('01', bankInfo);
  qrString += formatField('38', merchantAccount);

  // 53: Transaction Currency (704 for VND)
  qrString += formatField('53', '704');

  // 54: Transaction Amount
  if (amount > 0) {
    qrString += formatField('54', amount.toString());
  }

  // 58: Country Code
  qrString += formatField('58', 'VN');

  // 62: Additional Data Field Template (Payment description)
  if (memo) {
    const additionalData = formatField('08', memo);
    qrString += formatField('62', additionalData);
  }

  // 63: CRC
  qrString += '6304';
  const crc = calculateCRC16(qrString);
  qrString += crc;

  return qrString;
}
