const fs1 = require("fs");
const shell = require("shelljs");


const convertHdbviewToCds = (directory, extension) => {
    try {
      const files = shell.find(directory).filter((file) => file.endsWith(extension));
      files.forEach(file => {
        let data = fs1.readFileSync(file, "utf8");
        let {newFileContent,entityName} = convertToCds(data);
        fs1.writeFileSync(`${entityName}.cds`, newFileContent);  
      });
    } catch (error) {
      console.error(`Error: ${error}`);
    }
  };



  const convertToCds = (data) =>{
    const lines = data.split('\n').filter((line) => line.trim() !== ''); 
    // let viewIndex = data.indexOf('VIEW');
    // let viewNameStartIndex = data.indexOf('"', viewIndex) + 1;
    // let viewNameEndIndex = data.indexOf('"', viewNameStartIndex);
    // let viewName = data.substring(viewNameStartIndex, viewNameEndIndex);
  
    // let fromIndex = data.indexOf('FROM');
    // let tableNameStartIndex = data.indexOf('"', fromIndex) + 1;
    // let tableNameEndIndex = data.indexOf('"', tableNameStartIndex);
    // let tableName = data.substring(tableNameStartIndex, tableNameEndIndex);
  
    // let asIndex = data.indexOf('AS', fromIndex);
    // let aliasStartIndex = data.indexOf('"', asIndex) + 1;
    // let aliasEndIndex = data.indexOf('"', aliasStartIndex);
    // let alias = data.substring(aliasStartIndex, aliasEndIndex);
      
    // console.log('viewName: ', viewName); 
    // console.log('alias: ', alias);  
    // console.log('tableName: ', tableName); 

    let viewSplit = data.split('VIEW');
    let fromSplit = viewSplit[1].split('FROM');
    let asSplit = fromSplit[1].split('AS');

    
    const newFileContent = "viewName";
    const entityName = "tableName"
    return {newFileContent , entityName}
  }


module.exports = convertHdbviewToCds;