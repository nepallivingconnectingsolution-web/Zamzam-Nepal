import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const PARTNER_TYPES = ['hotel', 'restaurant', 'grocery', 'bus_operator', 'freight'] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

export interface PartnerDocumentSpec {
  type: string;
  label: string;
  hint: string;
}

export const PARTNER_DOCUMENT_CATALOG: Record<PartnerType, PartnerDocumentSpec[]> = {
  hotel: [
    { type: 'business_license', label: 'Hotel operating licence', hint: 'Tourism/hotel registration certificate issued by the local authority.' },
    { type: 'owner_id', label: "Owner's ID", hint: "The property owner's citizenship certificate or national ID." },
    { type: 'property_ownership', label: 'Property ownership / lease', hint: 'Land ownership certificate (lalpurja) or a signed lease agreement for the property.' },
  ],
  restaurant: [
    { type: 'business_license', label: 'Food business licence', hint: 'Local municipality food/business operating licence.' },
    { type: 'owner_id', label: "Owner's ID", hint: "The restaurant owner's citizenship certificate or national ID." },
    { type: 'health_certificate', label: 'Health & sanitation certificate', hint: 'Kitchen hygiene / food safety certificate, if issued in your area.' },
  ],
  grocery: [
    { type: 'business_license', label: 'Store operating licence', hint: 'Local municipality business registration certificate.' },
    { type: 'owner_id', label: "Owner's ID", hint: "The store owner's citizenship certificate or national ID." },
    { type: 'tax_registration', label: 'PAN / VAT registration', hint: 'Tax registration certificate (PAN or VAT) for the business.' },
  ],
  bus_operator: [
    { type: 'route_permit', label: 'Route permit', hint: 'Department of Transport Management route permit for this operator.' },
    { type: 'owner_id', label: "Owner's ID", hint: "The operator's citizenship certificate or national ID." },
    { type: 'company_registration', label: 'Company registration', hint: 'Firm/company registration certificate for the transport business.' },
  ],
  freight: [
    { type: 'transport_license', label: 'Transport licence', hint: 'Goods-carrier / transport operating licence.' },
    { type: 'owner_id', label: "Owner's ID", hint: "The transporter's citizenship certificate or national ID." },
    { type: 'company_registration', label: 'Company registration', hint: 'Firm/company registration certificate, if operating as a business.' },
  ],
};

export class VerifyPartnerDocumentDto {
  @IsIn(['APPROVED', 'SUSPENDED'], { message: 'status must be APPROVED or SUSPENDED.' })
  status!: 'APPROVED' | 'SUSPENDED';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reviewNote?: string;
}