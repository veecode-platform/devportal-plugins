import { makeStyles } from "@mui/styles";
import { Theme } from "@mui/material/styles";

export const useModalStyles = makeStyles((theme: Theme) => ({
    modal: {
        padding: '2rem',
        borderTop: `1px solid ${theme.palette.divider}`,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '1rem'
      },
      label:{
        marginLeft: '-.7rem',
      },
      formControl: {
        width: '100%'
      },
      selectEmpty: {
        marginTop: theme.spacing(2),
      },
      footer:{
        paddingBottom: '1rem'
      }
}))