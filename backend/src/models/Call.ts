import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// One click-to-call from the CRM. The provider first rings the user's own
// phone (agentNumber), then connects them to the lead/contact
// (customerNumber), recording the conversation. The provider reports back to
// /api/webhooks/voice/:callbackToken and we also poll it while the calling
// panel is open, so a call still finishes if a webhook is lost.
export type CallStatus = 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'no-answer' | 'failed' | 'canceled';

export const TERMINAL_CALL_STATUSES: CallStatus[] = ['completed', 'busy', 'no-answer', 'failed', 'canceled'];

export type CallDirection = 'outbound' | 'inbound';

interface CallAttributes {
  id: number;
  direction?: CallDirection; // outbound = click-to-call from the CRM; inbound = a customer called the company number
  provider: string;
  providerCallId?: string | null;
  callbackToken: string;
  status: CallStatus;
  agentNumber: string;
  customerNumber: string;
  callerId?: string | null;
  leadId?: number | null;
  contactId?: number | null;
  userId: number;
  notes?: string | null;
  durationSeconds?: number | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  recordingUrl?: string | null; // provider's URL, kept so a failed download can be retried
  recordingFile?: string | null; // our copy, under uploads/recordings/
  recordingContentType?: string | null;
  error?: string | null;
  lastPolledAt?: Date | null;
}

interface CallCreationAttributes extends Optional<CallAttributes, 'id' | 'status'> {}

class Call extends Model<CallAttributes, CallCreationAttributes> implements CallAttributes {
  public id!: number;
  public direction?: CallDirection;
  public provider!: string;
  public providerCallId?: string | null;
  public callbackToken!: string;
  public status!: CallStatus;
  public agentNumber!: string;
  public customerNumber!: string;
  public callerId?: string | null;
  public leadId?: number | null;
  public contactId?: number | null;
  public userId!: number;
  public notes?: string | null;
  public durationSeconds?: number | null;
  public startedAt?: Date | null;
  public endedAt?: Date | null;
  public recordingUrl?: string | null;
  public recordingFile?: string | null;
  public recordingContentType?: string | null;
  public error?: string | null;
  public lastPolledAt?: Date | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Call.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    direction: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'outbound' },
    provider: { type: DataTypes.STRING(30), allowNull: false },
    providerCallId: { type: DataTypes.STRING(80), allowNull: true },
    callbackToken: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'queued' },
    agentNumber: { type: DataTypes.STRING(20), allowNull: false },
    customerNumber: { type: DataTypes.STRING(20), allowNull: false },
    callerId: { type: DataTypes.STRING(20), allowNull: true },
    leadId: { type: DataTypes.INTEGER, allowNull: true },
    contactId: { type: DataTypes.INTEGER, allowNull: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    durationSeconds: { type: DataTypes.INTEGER, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    endedAt: { type: DataTypes.DATE, allowNull: true },
    recordingUrl: { type: DataTypes.STRING(1000), allowNull: true },
    recordingFile: { type: DataTypes.STRING(255), allowNull: true },
    recordingContentType: { type: DataTypes.STRING(60), allowNull: true },
    error: { type: DataTypes.STRING(500), allowNull: true },
    lastPolledAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'calls',
    sequelize,
    indexes: [{ fields: ['leadId'] }, { fields: ['contactId'] }, { fields: ['providerCallId'] }],
  }
);

export default Call;
