import { DataTable } from "react-native-paper";

import { useContext } from "react";

import { Context } from "../Context";

import TableRow from "./TableRow";

const TableHeader = () => (
  <DataTable.Header>
    <DataTable.Title>Feature</DataTable.Title>
    <DataTable.Title>Exhibit Value</DataTable.Title>
    <DataTable.Title>Use Exhibit Value</DataTable.Title>
    <DataTable.Title>Remote Value</DataTable.Title>
  </DataTable.Header>
);
export default function Table() {
  const { simEnvData } = useContext(Context);

  return (
    <DataTable>
      <TableHeader />
      {Object.keys(simEnvData).map((key, i) => (
        <TableRow feature={key} key={i} />
      ))}
    </DataTable>
  );
}