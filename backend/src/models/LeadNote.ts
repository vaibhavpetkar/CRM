import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// One call note on a lead, shown as "13/09/26 CNR (SAKSHI)": the day, what
// happened, and the sales person who wrote it. Notes typed in the CRM are
// stamped with today's date and the logged-in user; imported notes keep the
// date and name written in the sheet. The newest note sets the lead's status
// (when its text names one) and the lead's "last note" columns.
export type LeadNoteSource = 'manual' | 'import';

interface LeadNoteAttributes {
  id: number;
  leadId: number;
  noteDate: string; // YYYY-MM-DD (Indian time)
  text: string;
  status?: string | null; // lead status the text matched, e.g. 'cnr'
  salesPersonName?: string | null; // as written: "SAKSHI", "SS"
  userId?: number | null; // the sales person's user, when known
  createdById?: number | null;
  source: LeadNoteSource;
}

interface LeadNoteCreationAttributes extends Optional<LeadNoteAttributes, 'id' | 'source'> {}

class LeadNote extends Model<LeadNoteAttributes, LeadNoteCreationAttributes> implements LeadNoteAttributes {
  public id!: number;
  public leadId!: number;
  public noteDate!: string;
  public text!: string;
  public status?: string | null;
  public salesPersonName?: string | null;
  public userId?: number | null;
  public createdById?: number | null;
  public source!: LeadNoteSource;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

LeadNote.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    leadId: { type: DataTypes.INTEGER, allowNull: false },
    noteDate: { type: DataTypes.DATEONLY, allowNull: false },
    text: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: true },
    salesPersonName: { type: DataTypes.STRING(100), allowNull: true },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    createdById: { type: DataTypes.INTEGER, allowNull: true },
    source: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'manual' },
  },
  {
    tableName: 'lead_notes',
    sequelize,
    indexes: [{ fields: ['leadId', 'noteDate'] }, { fields: ['noteDate'] }, { fields: ['userId', 'noteDate'] }],
  }
);

export default LeadNote;
