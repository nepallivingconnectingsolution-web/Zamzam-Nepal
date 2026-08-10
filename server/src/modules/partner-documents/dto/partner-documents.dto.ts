import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const PARTNER_TYPES = ['hotel', 'restaurant', 'grocery', 'bus_operator', 'freight'] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

export interface PartnerDocumentSpec {
  type: string;
  label: string;
  hint: string;
  /**
   * Required documents gate the partner's ability to sell — see
   * PartnerDocumentsService.assertRequiredDocsUploaded, which every
   * "publish/create" endpoint calls before writing.
   *
   * The two optional ones are optional because their own hints say so: a
   * restaurant health certificate isn't issued by every municipality, and a
   * sole-trader freight operator has no company registration to give.
   * Blocking on a document a partner legitimately cannot obtain would make
   * the platform unusable for them.
   */
  required: boolean;
}

export const PARTNER_DOCUMENT_CATALOG: Record<PartnerType, PartnerDocumentSpec[]> = {
  hotel: [
    { type: 'business_license', label: 'Hotel operating licence', hint: 'Tourism/hotel registration certificate issued by the local authority.', required: true },
    { type: 'owner_id', label: "Owner's ID", hint: "The property owner's citizenship certificate or national ID.", required: true },
    { type: 'property_ownership', label: 'Property ownership / lease', hint: 'Land ownership certificate (lalpurja) or a signed lease agreement for the property.', required: true },
  ],
  restaurant: [
    { type: 'business_license', label: 'Food business licence', hint: 'Local municipality food/business operating licence.', required: true },
    { type: 'owner_id', label: "Owner's ID", hint: "The restaurant owner's citizenship certificate or national ID.", required: true },
    { type: 'health_certificate', label: 'Health & sanitation certificate', hint: 'Kitchen hygiene / food safety certificate, if issued in your area.', required: false },
  ],
  grocery: [
    { type: 'business_license', label: 'Store operating licence', hint: 'Local municipality business registration certificate.', required: true },
    { type: 'owner_id', label: "Owner's ID", hint: "The store owner's citizenship certificate or national ID.", required: true },
    { type: 'tax_registration', label: 'PAN / VAT registration', hint: 'Tax registration certificate (PAN or VAT) for the business.', required: true },
  ],
  bus_operator: [
    { type: 'route_permit', label: 'Route permit', hint: 'Department of Transport Management route permit for this operator.', required: true },
    { type: 'owner_id', label: "Owner's ID", hint: "The operator's citizenship certificate or national ID.", required: true },
    { type: 'company_registration', label: 'Company registration', hint: 'Firm/company registration certificate for the transport business.', required: true },
  ],
  freight: [
    { type: 'transport_license', label: 'Transport licence', hint: 'Goods-carrier / transport operating licence.', required: true },
    { type: 'owner_id', label: "Owner's ID", hint: "The transporter's citizenship certificate or national ID.", required: true },
    { type: 'company_registration', label: 'Company registration', hint: 'Firm/company registration certificate, if operating as a business.', required: false },
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