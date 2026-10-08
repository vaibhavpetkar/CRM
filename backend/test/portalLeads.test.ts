import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapPropertyLead, parseBudget, parseConfiguration, parsePropertyType } from '../src/utils/propertyLeadMapping';
import { parse99acresXml, housingSignature, leadsInBody } from '../src/services/portalLeadsService';
import { readInboundEvent } from '../src/services/incomingCallService';

// ─── Portal lead mapping ────────────────────────────────────────────────────

test('budgets in lakh / crore, with ranges', () => {
  assert.deepEqual(parseBudget('₹45 L'), [4500000, null]);
  assert.deepEqual(parseBudget('50-75 lakh'), [5000000, 7500000]);
  assert.deepEqual(parseBudget('1.2 Cr'), [12000000, null]);
  assert.deepEqual(parseBudget('Rs. 80,00,000'), [8000000, null]);
  assert.deepEqual(parseBudget('2 BHK'), [null, null]);
});

test('configuration and property type from free text', () => {
  assert.equal(parseConfiguration('2bhk flat'), '2 BHK');
  assert.equal(parseConfiguration('1 RK'), '1 RK');
  assert.equal(parseConfiguration('6 bedroom'), '5+ BHK');
  assert.equal(parsePropertyType('Independent villa'), 'Villa');
  assert.equal(parsePropertyType('3 BHK flat'), 'Apartment');
});

test('a MagicBricks-style push maps onto lead fields', () => {
  const lead = mapPropertyLead({
    lead_id: 'MB-991',
    name: 'Rahul Sharma',
    mobile: '+91 98765 43210',
    email: 'Rahul@Example.com',
    project: { name: 'Skyline Heights', locality: 'Baner', city: 'Pune' },
    message: 'Looking for 2 BHK, budget 60-75 lakh',
  });
  assert.equal(lead.externalId, 'MB-991');
  assert.equal(lead.firstName, 'Rahul');
  assert.equal(lead.lastName, 'Sharma');
  assert.equal(lead.mobile, '9876543210');
  assert.equal(lead.email, 'rahul@example.com');
  assert.equal(lead.preferredLocation, 'Baner');
  assert.equal(lead.city, 'Pune');
  assert.equal(lead.configuration, '2 BHK');
  assert.equal(lead.budgetMin, 6000000);
  assert.equal(lead.budgetMax, 7500000);
});

test('Meta field_data custom questions fill the requirement', () => {
  const lead = mapPropertyLead([
    { name: 'full_name', values: ['Asha Patil'] },
    { name: 'phone_number', values: ['+919812345678'] },
    { name: 'which_configuration_are_you_looking_for?', values: ['3 BHK'] },
    { name: 'what_is_your_budget?', values: ['1 - 1.5 Cr'] },
    { name: 'preferred_location', values: ['Wakad'] },
  ]);
  assert.equal(lead.firstName, 'Asha');
  assert.equal(lead.mobile, '9812345678');
  assert.equal(lead.configuration, '3 BHK');
  assert.equal(lead.preferredLocation, 'Wakad');
  assert.equal(lead.budgetMin, 10000000);
  assert.equal(lead.budgetMax, 15000000);
});

test('without a portal id the same enquiry gets the same id', () => {
  const a = mapPropertyLead({ name: 'X', phone: '9876543210', project: 'P' });
  const b = mapPropertyLead({ name: 'X', phone: '09876543210', project: 'P' });
  assert.ok(a.externalId);
  assert.equal(a.externalId, b.externalId);
});

test('99acres response XML', () => {
  const xml = `<?xml version="1.0"?><Xml ActionStatus="true"><Resp><QryDtl ResType="Project" QueryId="Q123"><CmpctLabl><![CDATA[Green Valley, Hinjewadi]]></CmpctLabl><QryInfo>Interested in 2 BHK</QryInfo><RcvdOn>2026-10-08 10:15:00</RcvdOn></QryDtl><CntctDtl><Name>Neha</Name><Email>neha@example.com</Email><Phone>+91-9988776655</Phone></CntctDtl></Resp></Xml>`;
  const [row] = parse99acresXml(xml);
  assert.equal(row.query_id, 'Q123');
  assert.equal(row.project_name, 'Green Valley, Hinjewadi');
  const lead = mapPropertyLead(row);
  assert.equal(lead.externalId, 'Q123');
  assert.equal(lead.mobile, '9988776655');
  assert.equal(lead.configuration, '2 BHK');
  assert.throws(() => parse99acresXml('<Xml ActionStatus="false"><ErrorMsg>Invalid login</ErrorMsg></Xml>'), /Invalid login/);
});

test('Housing.com hash and list bodies', () => {
  assert.equal(housingSignature(1700000000, 'k'), housingSignature(1700000000, 'k'));
  assert.equal(housingSignature(1700000000, 'k').length, 64);
  assert.equal(leadsInBody({ data: [{ a: 1 }, { a: 2 }] }).length, 2);
  assert.equal(leadsInBody({ name: 'one' }).length, 1);
});

// ─── Incoming calls ─────────────────────────────────────────────────────────

test('incoming call event: caller, agent and company number', () => {
  const e = readInboundEvent({ call_id: 'abc', caller_number: '09876543210', agent_number: '+91 91234 56789', did: '02071234567', status: 'ANSWERED' });
  assert.equal(e.providerCallId, 'abc');
  assert.equal(e.customer, '+919876543210');
  assert.equal(e.agent, '+919123456789');
  assert.equal(e.did, '+912071234567');
  assert.equal(e.isFinalReport, false);
  const exotel = readInboundEvent({ CallSid: 'x1', CallFrom: '9876543210', CallTo: '08047112345', DialWhomNumber: '9123456789', RecordingUrl: 'https://r/x.mp3' });
  assert.equal(exotel.customer, '+919876543210');
  assert.equal(exotel.agent, '+919123456789');
  assert.equal(exotel.isFinalReport, true);
});

test('"under 75 lakh" is a ceiling, "above 1 Cr" a floor', () => {
  assert.deepEqual(parseBudget('2 BHK under 75 lakh'), [null, 7500000]);
  assert.deepEqual(parseBudget('above 1 Cr'), [10000000, null]);
});
