const fs1 = require("fs");
const shell = require("shelljs");

const convertHdbtableToCds = (directory, extension) => {
  try {
    const files = shell.find(directory).filter((file) => file.endsWith(extension));
    files.forEach(file => {
      let data = fs1.readFileSync(file, "utf8");
      let { newFileContent, entityName, planeColumnQuotedTable, hdbViewResult} = convertToCds(data);
      if(newFileContent) fs1.writeFileSync(`${entityName}.cds`, newFileContent);
      if(planeColumnQuotedTable) fs1.writeFileSync(`${entityName}.hdbsynonym`, planeColumnQuotedTable);
      if(hdbViewResult) fs1.writeFileSync(`${entityName}.hdbview`, hdbViewResult);  
    });
  } catch (error) {
    console.error(`Error: ${error}`);
  }
};

const isValidJoinLine = (line) => {
  return line.includes("JOIN") && line.includes("AS") && line.includes("ON") && line.includes("=");
}

const isValidManyJoinLine = (line) => {
  return (line.includes("MANY TO ONE JOIN") || line.includes("MANY TO MANY JOIN")) && line.includes("AS") && line.includes("ON") && line.includes("=");
}

const convertSqlToAssociation = (sqlString) => {
  //MAKE SURE LINE HAS JOING CONDITION
  if(isValidManyJoinLine(sqlString)){
    let associations  = sqlString.trim().replace(/\)\)+WITH ASSOCIATIONS \((?=\s*MANY)/, "").replace(/\),$/g, ")").replace(/\(/g, "").replace(/\)/g, "").split(/\s*,\s*JOIN\s+/);
    return associations.map((line) => {
      // SPLITING LINE BASED ON ALIAS AND JOINING OPERATOR
      let asIndex = line.indexOf(' AS ');
      let onIndex = line.indexOf(' ON ');
      
      let table = line.substring(line.indexOf('JOIN') + 4, asIndex).trim();
      let alias = line.substring(asIndex + 3, onIndex).trim();
      let rightId = line.substring(onIndex+ 3).trim();       
      let associationType = line.includes("MANY TO MANY JOIN") ? "Association to many" : "Association to";
 
      return `${alias} : ${associationType} ${table} on ${rightId};`;    
    });
  }else if(isValidJoinLine(sqlString)){
      let associations = sqlString.trim().replace(/^WITH ASSOCIATIONS\(\s*JOIN\s+/, "").replace(/\)\s*$/, "").split(/\s*,\s*JOIN\s+/);
      return associations.map((line)=>{
          //SPLITING LINE BASED ON ALIAS AND JOINING OPERATOR
          let asIndex = line.indexOf("AS");
          let onIndex = line.indexOf("ON");
          let equalsIndex = line.indexOf("=");
  
          let table = line.substring(0, asIndex).replace(/"/g, '').replace(/JOIN/g, '').trim().split(".").pop();
          let alias = line.substring(asIndex + 2, onIndex).replace(/\./g, '_').trim().replace(/"/g, '');
          let rightId = line.substring(equalsIndex + 1).trim().replace(/"/g, '').replace(/\./g, '_') .replace(/,/g, '').split("_").pop();
          return `${alias}:Association to ${table} on ${alias}.${rightId} = $self.${alias}_${rightId};`;
      })
  }
}

const dataTypesCleanUp = (type) =>{
  if (type.includes('(') && type.includes(')')) {
    return type; 
} else {
    return type.split('(')[0].replace(',', ''); 
}
}
 
const convertDbTypes = (types) => {

  types = dataTypesCleanUp(types)
  let match = types.match(/\(([^)]+)\)/);
  if (match) {
    switch (true) {
      case types.startsWith('DECIMAL'):
        return `Decimal(${match[1].trim()})`;
      case types.startsWith('NVARCHAR'):
        return `String(${match[1].trim()})`;
      case types.startsWith('VARCHAR'):
        return `String(${match[1].trim()})`;
      case types.startsWith('ST_POINT'):
        return `hana.ST_POINT(${match[1].trim()})`;
      case types.startsWith('ST_GEOMETRY'):
          return `hana.ST_GEOMETRY(${match[1].trim()})`;
    }
  }
  switch (types) {
    case 'DECIMAL':
      return 'Decimal';
    case 'NVARCHAR':
      return 'String';
    case 'INTEGER':
    case 'INT':
      return 'Integer';
    case 'TINYINT':
    case 'SMALLINT':
      return 'Int16';
    case 'MEDIUMINT':
      return 'Int32';
    case 'BIGINT':
      return 'Integer64';
    case 'NUMERIC':
    case 'FLOAT':
    case 'REAL':
    case 'DOUBLE':
      return 'Double';
    case 'CHAR':
    case 'NCHAR':
    case 'VARCHAR':
    case 'TEXT':
      return 'String'
    case 'DATE':
      return 'Date';
    case 'TIME':
      return 'Time';
    case 'DATETIME':
      return 'DateTime';
    case 'TIMESTAMP':
    case 'LONGDATE':
    case 'SECONDDATE':
      return 'Timestamp';
    case 'NCLOB':
     return 'LargeString'
    case 'BLOB':
      return 'LargeBinary'
    case 'ST_POINT':
      return 'hana.ST_POINT'
    case 'ST_GEOMETRY':
      return 'hana.ST_GEOMETRY'
    default:
      return types;
  }
}

const convertToHdbsynonym = (tableName) =>{
    return `{
  ${tableName.toUpperCase() .replace(/"/g, '').replace(/\./g, '_').replace(/::/g, '_')} : {
      "target": {
        "object" : ${tableName}
      }
    }
  }`
}

const convertTohdbview = (tableName,entityName,columns) =>{
  const hdbviewOutput = [
    `VIEW ${entityName.toUpperCase()} AS SELECT`,
    ...columns.map((name) => `  ${name}  AS ${name.toUpperCase().replace(/"/g, '').replace(/\./g, '_')};`),
   `FROM ${tableName}`,
  ].join('\n');

  return hdbviewOutput
}

const convertToCds = (data) =>{

  const sqlDataTypes = ['NVARCHAR','DECIMAL','INTEGER','INT','TINYINT','SMALLINT','MEDIUMINT','BIGINT','NUMERIC','FLOAT','DOUBLE','NCHAR','CHAR','VARCHAR','TEXT','DATE','TIME','DATETIME','LONGDATE','TIMESTAMP','SECONDDATE','NCLOB','BLOB','ST_POINT','ST_GEOMETRY'];
  const lines = data.split('\n').filter((line) => line.trim() !== ''); 
  let entityName = lines[0].replace(/column table /ig, '').trim().replace(' (', '');
  let tableName = entityName;
  entityName = entityName.replace(/"/g, '').replace(/\./g, '_').replace(/::/g, '_');

  //MAPING KEYS 
  let keyNamesArray = [];
  if (data.includes('PRIMARY KEY')) {
    let match = data.match(/PRIMARY KEY\s*\(\s*([^)]+?)\s*\)\s*\)/s);
    if (match && match[1]) {
      let keys = match[1].split(',');
      keyNamesArray = keys.map(key => key.trim().replace(/['"]/g, '').replace(/\./g, '_'));
    } 
  }

  const columns = [];
  const columnsForViews = []
  for (let i = 1; i < lines.length ; i++) {
    //EXCLUDING COMMENTS
    const columnLine = lines[i].trim().replace(/COMMENT.*$/, '');
    if(columnLine !== ""){
      //SPLITING NAMES AND TYPES
      let matches = columnLine.split(" ").filter(Boolean);
      //CHECKING ONLY DATATYPES BEFORE MAPING
      if(matches.length > 1 && sqlDataTypes.includes(dataTypesCleanUp(matches[1]).split('(')[0].replace(/['"]+/g, '').toUpperCase().trim())){
        columnsForViews.push(matches[0].replace(/\)+/, '').trim())
        let name = matches[0].replace(/"/g, '').replace(/\)+/, '').trim().replace(/\./g, '_');
        if (name.toUpperCase() !== "COMMENT") {
          //OPTIMIZATION BY POPING MAPPED KEYS IN STACK
            for(let j=0;j<keyNamesArray.length;j++){
              if (name === keyNamesArray[j]) {
                name = `key ${name}`;
                keyNamesArray.splice(j, 1);
                break
              }
            }
          const type = convertDbTypes(matches[1].toUpperCase());
          columns.push({name, type});
        }
      }
    }
  }

  let associationDetails = [];
  if(data.includes("ASSOCIATIONS") && data.includes("JOIN")){
    const splitdata = data.split("\n")
    splitdata.forEach((line)=>{
      let manipulatedData = convertSqlToAssociation(line)
      if(manipulatedData){
        associationDetails.push(manipulatedData)
      }
    })
  }
  //CHECK 3 DIFFERENT CASES
  let isEntityQuoted = tableName.includes('"')
  let columnQuote = false;
  if(isEntityQuoted){
    for(let i =1; i < lines.length; i++){
      const columnLine = lines[i].trim().replace(/COMMENT.*$/, '');
      if(columnLine !== ""){
        let matches = columnLine.split(" ").filter(Boolean);
        if(matches.length > 1 && sqlDataTypes.includes(dataTypesCleanUp(matches[1]).split('(')[0].replace(/['"]+/g, '').toUpperCase().trim())){
          columnQuote = matches[0].includes('"')
          break
        }
      }
    }
  }
  let planeColumnQuotedTable = isEntityQuoted && !columnQuote ? convertToHdbsynonym(tableName) : undefined;
  let quotedColumnQuotedTable = columnQuote && isEntityQuoted;
  // let hdbViewResult = quotedColumnQuotedTable ? (planeColumnQuotedTable = convertToHdbsynonym(tableName), convertTohdbview(tableName,entityName,columnsForViews)) : undefined;
  let hdbViewResult = undefined;
  if(quotedColumnQuotedTable) planeColumnQuotedTable = convertToHdbsynonym(tableName);

  const newFileContent = [
    `@cds.persistence.exists`,
    `Entity ${entityName} {`,
    ...columns.map(({ name, type }) => `  ${name}: ${type};`),
    ...associationDetails,
    '}',
  ].join('\n');

  return {
    newFileContent,
    entityName,
    planeColumnQuotedTable,
    hdbViewResult
  }
}

module.exports = convertHdbtableToCds;
