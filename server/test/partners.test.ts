// Run: npm test -w server  (pure logic, no database or network)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseParties } from '../src/importers/ted-parties';
import { validSiret } from '../src/lib/invites';
import { nutsRegion, tenderGaps } from '../src/lib/partners';

const org = (ref: string, name: string, extra = '') => `
  <efac:Organization><efac:Company>
    <cac:PartyIdentification><cbc:ID schemeName="organization">${ref}</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name languageID="FRA">${name}</cbc:Name></cac:PartyName>${extra}
  </efac:Company></efac:Organization>`;

const XML = `
<efac:NoticeResult>
  <efac:LotResult><efac:LotTender><cbc:ID schemeName="tender">TEN-0001</cbc:ID></efac:LotTender></efac:LotResult>
  <efac:LotTender><cbc:ID schemeName="tender">TEN-0001</cbc:ID>
    <efac:TenderingParty><cbc:ID schemeName="tendering-party">TPA-0001</cbc:ID></efac:TenderingParty></efac:LotTender>
  <efac:LotTender><cbc:ID schemeName="tender">TEN-0002</cbc:ID>
    <efac:TenderingParty><cbc:ID schemeName="tendering-party">TPA-0002</cbc:ID></efac:TenderingParty></efac:LotTender>
  <efac:SettledContract><cbc:ID schemeName="contract">CON-0001</cbc:ID>
    <efac:LotTender><cbc:ID schemeName="tender">TEN-0001</cbc:ID></efac:LotTender></efac:SettledContract>
  <efac:TenderingParty><cbc:ID schemeName="tendering-party">TPA-0001</cbc:ID><cbc:Name>GRP A &amp; B</cbc:Name>
    <efac:Tenderer><cbc:ID schemeName="organization">ORG-0002</cbc:ID><efbc:GroupLeadIndicator>true</efbc:GroupLeadIndicator></efac:Tenderer>
    <efac:Tenderer><cbc:ID schemeName="organization">ORG-0003</cbc:ID><efbc:GroupLeadIndicator>false</efbc:GroupLeadIndicator></efac:Tenderer>
  </efac:TenderingParty>
  <efac:TenderingParty><cbc:ID schemeName="tendering-party">TPA-0002</cbc:ID>
    <efac:Tenderer><cbc:ID schemeName="organization">ORG-0004</cbc:ID></efac:Tenderer>
  </efac:TenderingParty>
</efac:NoticeResult>
${org('ORG-0002', 'ALPHA', `<cac:PostalAddress><cbc:CityName>LYON</cbc:CityName><cbc:CountrySubentityCode listName="nuts">FRK26</cbc:CountrySubentityCode></cac:PostalAddress>
  <cac:PartyLegalEntity><cbc:CompanyID>401 948 245 00030</cbc:CompanyID></cac:PartyLegalEntity>
  <cac:Contact><cbc:ElectronicMail>Contact@Alpha.fr</cbc:ElectronicMail></cac:Contact>`)}
${org('ORG-0003', 'BETA &amp; Co', `<cac:Contact><cbc:ElectronicMail>mailgenerique@titulaire.fr</cbc:ElectronicMail></cac:Contact>`)}
${org('ORG-0004', 'GAMMA')}`;

test('parseParties: groupement members, leader, winner and organisation details', () => {
  const { parties, orgs } = parseParties(XML);
  assert.equal(parties.length, 2);
  const [grp, solo] = parties;
  assert.deepEqual(grp, { ref: 'TPA-0001', name: 'GRP A & B', won: true, members: [{ ref: 'ORG-0002', leader: true }, { ref: 'ORG-0003', leader: false }] });
  assert.equal(solo.won, false); // TEN-0002 has no settled contract
  const a = orgs.get('ORG-0002')!;
  assert.equal(a.siret, '40194824500030');
  assert.equal(a.email, 'contact@alpha.fr');
  assert.equal(nutsRegion(a.nuts), 'Auvergne-Rhône-Alpes');
  assert.equal(orgs.get('ORG-0003')!.name, 'BETA & Co');
  assert.equal(orgs.get('ORG-0003')!.email, null, 'placeholder emails are dropped');
});

test('validSiret: Luhn checksum on SIREN/SIRET', () => {
  assert.equal(validSiret('40194824500030'), true);
  assert.equal(validSiret('401948245'), true);
  assert.equal(validSiret('40194824500031'), false);
  assert.equal(validSiret('1234'), false);
  assert.equal(validSiret(null), false);
});

test('tenderGaps: capabilities the notice asks for that the profile lacks', () => {
  const company = {
    description: 'Lyon digital agency', services: ['Accessible web apps (RGAA)'], differentiators: [], profile: {},
  } as unknown as Parameters<typeof tenderGaps>[0];
  const { gaps, covered } = tenderGaps(company, 'Refonte du portail, accessibilité RGAA, hébergement et tierce maintenance applicative');
  assert.deepEqual(gaps.map((g) => g.key).sort(), ['hosting', 'tma']);
  assert.ok(covered.includes('Accessibility (RGAA)'));
  assert.ok(gaps.find((g) => g.key === 'tma')!.evidence.includes('tierce maintenance'));
});
